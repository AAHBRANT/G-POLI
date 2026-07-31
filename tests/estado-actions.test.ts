import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podePublicar: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

vi.mock("@/lib/notificacao/graph", () => ({
  enviarNotificacaoPoliticaPublicada: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({ salvarArquivo: vi.fn() }));

vi.mock("@/lib/politica/gerarDocx", () => ({ gerarDocumentoOficial: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { revalidatePath } from "next/cache";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import { publicarPolitica } from "@/app/(shell)/catalogo/[id]/estado-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const publicarPermitido = podePublicar as ReturnType<typeof vi.fn>;
const notificar = enviarNotificacaoPoliticaPublicada as ReturnType<typeof vi.fn>;
const salvar = salvarArquivo as ReturnType<typeof vi.fn>;
const gerar = gerarDocumentoOficial as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const politicaUpdate = prisma.politica.update as ReturnType<typeof vi.fn>;
const transacao = prisma.$transaction as ReturnType<typeof vi.fn>;
const auditoriaRegistrar = registrar as ReturnType<typeof vi.fn>;
const revalidar = revalidatePath as ReturnType<typeof vi.fn>;

const versaoCreate = vi.fn();
const versaoUpdateMany = vi.fn();
const versaoCount = vi.fn();

function politicaBase() {
  return {
    id: "p1",
    titulo: "Política de Teste",
    codigo: "AHBT-POL-TI-001",
    estado: "rascunho",
    publicadaEm: null,
    revisao: 0,
    area: { id: "a1", nome: "Tecnologia da Informação" },
    secoes: [{ ordem: 1, codigo: "1", titulo: "Objetivo", tipo: "texto", corpo: "Texto.", colunas: null, linhas: null }],
  };
}

describe("publicarPolitica — geração do documento oficial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Teste", email: "teste@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    transacao.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
  });

  it("gera o .docx, salva e publica quando a geração funciona", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(versaoCreate).toHaveBeenCalledTimes(1);
    expect(versaoCreate.mock.calls[0][0].data.documento.create.oficial).toBe(true);
  });

  it("fail-closed: se a geração falhar, não publica e não mexe no banco", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockRejectedValue(new Error("template quebrado"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toMatch(/documento oficial/i);
    expect(politicaUpdate).not.toHaveBeenCalled();
    expect(versaoCreate).not.toHaveBeenCalled();
  });

  it("fail-closed: se salvar o arquivo/transação falhar, não publica nem roda pós-publicação", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    salvar.mockRejectedValue(new Error("disco cheio"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toMatch(/documento oficial/i);
    expect(politicaUpdate).not.toHaveBeenCalled();
    expect(versaoCreate).not.toHaveBeenCalled();
    expect(auditoriaRegistrar).not.toHaveBeenCalled();
    expect(revalidar).not.toHaveBeenCalled();
  });
});
