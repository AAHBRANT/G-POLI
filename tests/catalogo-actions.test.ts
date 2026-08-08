import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    area: { upsert: vi.fn() },
    politica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeCriarPolitica: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));
vi.mock("@/lib/politica/codigo", () => ({ gerarCodigoNormativo: vi.fn().mockResolvedValue("AHBT-POL-TI-001") }));

// Só `extrairSecoes` é mockado (é a única parte com I/O real — parsers de
// docx/pdf); `extensaoSuportada` continua a implementação real, pura.
vi.mock("@/lib/politica/importarDocumento", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/politica/importarDocumento")>();
  return { ...original, extrairSecoes: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { criarPolitica, importarDocumento } from "@/app/(shell)/catalogo/actions";
import { extrairSecoes } from "@/lib/politica/importarDocumento";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const podeCriar = podeCriarPolitica as ReturnType<typeof vi.fn>;
const upsert = prisma.area.upsert as ReturnType<typeof vi.fn>;
const create = prisma.politica.create as ReturnType<typeof vi.fn>;
const extrair = extrairSecoes as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

function arquivoFalso(nome: string, conteudo = "conteúdo", tamanho?: number): File {
  const dados = tamanho !== undefined ? new Uint8Array(tamanho) : conteudo;
  return new File([dados], nome, { type: "text/plain" });
}

function formData(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("criarPolitica — consorcioId", () => {
  it("sem consorcio no form: consorcioId fica undefined (AAHBRANT/todos)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
    create.mockResolvedValue({ id: "pol-1" });

    await criarPolitica(formData({ titulo: "Norma X", area: "TI", classificacao: "publico_interno" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consorcioId: undefined }) }),
    );
  });

  it("com consorcio selecionado: persiste consorcioId", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
    create.mockResolvedValue({ id: "pol-1" });

    await criarPolitica(formData({ titulo: "Norma X", area: "TI", classificacao: "publico_interno", consorcioId: "c1" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consorcioId: "c1" }) }),
    );
  });
});

describe("importarDocumento", () => {
  function formDataComArquivo(campos: Record<string, string>, arquivo: File | null): FormData {
    const f = formData(campos);
    if (arquivo) f.set("arquivo", arquivo);
    return f;
  }

  beforeEach(() => {
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Fulano" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
  });

  it("bloqueia quem não pode criar política", async () => {
    podeCriar.mockReturnValue(false);
    const r = await importarDocumento(
      formDataComArquivo({ titulo: "X", area: "TI", classificacao: "publico_interno" }, arquivoFalso("a.docx")),
    );
    expect(r.ok).toBe(false);
    expect(extrair).not.toHaveBeenCalled();
  });

  it("sem arquivo selecionado: erro, não chama extração nem cria política", async () => {
    const r = await importarDocumento(
      formDataComArquivo({ titulo: "X", area: "TI", classificacao: "publico_interno" }, null),
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/selecione um arquivo/i);
    expect(extrair).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("extensão não suportada: erro, não chama extração", async () => {
    const r = await importarDocumento(
      formDataComArquivo({ titulo: "X", area: "TI", classificacao: "publico_interno" }, arquivoFalso("planilha.xlsx")),
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/formato não suportado/i);
    expect(extrair).not.toHaveBeenCalled();
  });

  it("arquivo maior que 10 MB: erro, não chama extração", async () => {
    const grande = arquivoFalso("grande.docx", undefined, 11 * 1024 * 1024);
    const r = await importarDocumento(
      formDataComArquivo({ titulo: "X", area: "TI", classificacao: "publico_interno" }, grande),
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/10 mb/i);
    expect(extrair).not.toHaveBeenCalled();
  });

  it("extração falha: propaga a mensagem de erro, não cria política", async () => {
    extrair.mockRejectedValue(new Error("Não foi possível extrair conteúdo do arquivo."));
    const r = await importarDocumento(
      formDataComArquivo({ titulo: "X", area: "TI", classificacao: "publico_interno" }, arquivoFalso("a.docx")),
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("Não foi possível extrair conteúdo do arquivo.");
    expect(create).not.toHaveBeenCalled();
  });

  it("sucesso: cria a política com uma Secao por item extraído, tipo texto, código sequencial", async () => {
    extrair.mockResolvedValue([
      { titulo: "Objetivo", corpo: "Texto do objetivo." },
      { titulo: "Abrangência", corpo: "Texto da abrangência." },
    ]);
    create.mockResolvedValue({ id: "pol-nova" });

    const r = await importarDocumento(
      formDataComArquivo({ titulo: "Norma Importada", area: "TI", classificacao: "publico_interno" }, arquivoFalso("a.docx")),
    );

    expect(r).toEqual({ ok: true, id: "pol-nova" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titulo: "Norma Importada",
          secoes: {
            create: [
              { ordem: 1, codigo: "1", titulo: "Objetivo", tipo: "texto", corpo: "Texto do objetivo." },
              { ordem: 2, codigo: "2", titulo: "Abrangência", tipo: "texto", corpo: "Texto da abrangência." },
            ],
          },
        }),
      }),
    );
  });

  it("título/área faltando: erro antes de chamar extração (mesma validação de criarPolitica)", async () => {
    const r = await importarDocumento(
      formDataComArquivo({ titulo: "", area: "TI", classificacao: "publico_interno" }, arquivoFalso("a.docx")),
    );
    expect(r.ok).toBe(false);
    expect(extrair).not.toHaveBeenCalled();
  });

  it("texto colado (sem arquivo): usa extrairDeTextoSimples direto, não chama extrairSecoes", async () => {
    create.mockResolvedValue({ id: "pol-texto" });
    const f = formData({ titulo: "Norma Colada", area: "TI", classificacao: "publico_interno" });
    f.set("texto", "Objetivo\n\nTexto do objetivo colado.\n\nAbrangência\n\nTexto da abrangência colada.");

    const r = await importarDocumento(f);

    expect(r).toEqual({ ok: true, id: "pol-texto" });
    expect(extrair).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secoes: {
            create: [
              { ordem: 1, codigo: "1", titulo: "Objetivo", tipo: "texto", corpo: "Texto do objetivo colado." },
              { ordem: 2, codigo: "2", titulo: "Abrangência", tipo: "texto", corpo: "Texto da abrangência colada." },
            ],
          },
        }),
      }),
    );
  });

  it("texto colado vazio/só espaço e sem arquivo: mesmo erro de 'selecione um arquivo ou cole o texto'", async () => {
    const f = formData({ titulo: "X", area: "TI", classificacao: "publico_interno" });
    f.set("texto", "   ");

    const r = await importarDocumento(f);

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/selecione um arquivo ou cole o texto/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("arquivo E texto colado juntos: arquivo tem prioridade", async () => {
    extrair.mockResolvedValue([{ titulo: "Do Arquivo", corpo: "Veio do arquivo." }]);
    create.mockResolvedValue({ id: "pol-prioridade" });
    const f = formDataComArquivo({ titulo: "X", area: "TI", classificacao: "publico_interno" }, arquivoFalso("a.docx"));
    f.set("texto", "Texto colado que deveria ser ignorado.");

    const r = await importarDocumento(f);

    expect(r.ok).toBe(true);
    expect(extrair).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secoes: { create: [{ ordem: 1, codigo: "1", titulo: "Do Arquivo", tipo: "texto", corpo: "Veio do arquivo." }] },
        }),
      }),
    );
  });
});
