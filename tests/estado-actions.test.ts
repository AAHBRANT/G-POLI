import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn(), update: vi.fn() },
    pendencia: { createMany: vi.fn(), updateMany: vi.fn() },
    usuario: { findMany: vi.fn() },
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

vi.mock("@/lib/politica/pendencia", () => ({ dadosPendencia: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { revalidatePath } from "next/cache";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import { dadosPendencia } from "@/lib/politica/pendencia";
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
const dadosPendenciaMock = dadosPendencia as ReturnType<typeof vi.fn>;
const pendenciaCreateMany = prisma.pendencia.createMany as ReturnType<typeof vi.fn>;
const pendenciaUpdateMany = prisma.pendencia.updateMany as ReturnType<typeof vi.fn>;
const usuarioFindMany = prisma.usuario.findMany as ReturnType<typeof vi.fn>;

const versaoCreate = vi.fn();
const versaoUpdateMany = vi.fn();
const versaoCount = vi.fn();

function politicaBase() {
  return {
    id: "p1",
    titulo: "Política de Teste",
    codigo: "AHBT-POL-TI-001",
    tipo: "politica", // NOVO — necessário p/ criarPendencias(id, politica.tipo, ...) == "politica" (assert do novo describe)
    estado: "rascunho",
    publicadaEm: null,
    revisao: 0,
    area: { id: "a1", nome: "Tecnologia da Informação" },
    secoes: [{ ordem: 1, codigo: "1", titulo: "Objetivo", tipo: "texto", corpo: "Texto.", colunas: null, linhas: null }],
    audienciaSetores: [],   // NOVO — vazio = "todos os colaboradores" (audienciaVazia)
    audienciaUsuarios: [],  // NOVO
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
    // NOVO — resolverAudiencia (extraída neste task) agora roda incondicionalmente
    // em publicarPolitica, fora do try/catch best-effort; sem este default, o
    // findMany() sem mock retorna undefined e resolverAudiencia lança ao tentar
    // `.map`, quebrando estes testes que não sao sobre audiência/notificação.
    usuarioFindMany.mockResolvedValue([]);
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
    // Invariante central: só a cadeia de documentos OFICIAIS é substituída.
    // Se o filtro `documento: { oficial: true }` sumisse do where, TODOS os
    // anexos manuais seriam marcados "substituida" a cada publicação.
    expect(versaoUpdateMany.mock.calls[0][0].where).toMatchObject({
      documento: { oficial: true },
    });
  });

  it("republicação: incrementa a revisão e continua filtrando só o oficial no updateMany", async () => {
    findUnique.mockResolvedValue({
      // Reaberta para revisão após já ter sido publicada: estado volta a
      // "rascunho" (só assim `publicar` é permitido — ver `transicao`), mas
      // `publicadaEm`/`revisao` carregam o histórico da publicação anterior.
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 2,
    });
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(politicaUpdate.mock.calls[0][0].data.revisao).toBe(3);
    expect(versaoUpdateMany.mock.calls[0][0].where).toMatchObject({
      documento: { oficial: true },
    });
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

describe("publicarPolitica — cria Pendencia (best-effort)", () => {
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
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    usuarioFindMany.mockResolvedValue([
      { id: "u1", oid: "oid1", nome: "Teste", email: "teste@aahbrant.com", ativo: true },
    ]);
    dadosPendenciaMock.mockReturnValue([
      { politicaId: "p1", usuarioId: "u1", politicaPublicadaEm: new Date(), tipo: "politica", estado: "pendente" },
    ]);
  });

  it("cria Pendencia via createMany para a audiência resolvida, e cancela pendências anteriores da mesma política", async () => {
    findUnique.mockResolvedValue(politicaBase());

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(dadosPendenciaMock).toHaveBeenCalledWith("p1", "politica", expect.any(Date), expect.any(Array));
    expect(pendenciaUpdateMany).toHaveBeenCalledWith({
      where: { politicaId: "p1", estado: "pendente" },
      data: { estado: "cancelada" },
    });
    expect(pendenciaCreateMany).toHaveBeenCalledTimes(1);
    expect(pendenciaCreateMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("falha ao criar Pendencia NÃO desfaz a publicação (best-effort)", async () => {
    findUnique.mockResolvedValue(politicaBase());
    pendenciaCreateMany.mockRejectedValue(new Error("db fora do ar"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true); // publicação já estava commitada antes deste bloco
  });

  it("resolverAudiencia falhando (hiccup transitório de banco) não impede a publicação nem os revalidatePath (fail-open)", async () => {
    // 1ª chamada a findUnique: a que já existia em publicarPolitica (carrega a política).
    // 2ª chamada: a de resolverAudiencia — é essa que falha aqui.
    findUnique.mockResolvedValueOnce(politicaBase()).mockRejectedValueOnce(new Error("db fora do ar"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true); // publicação já estava commitada antes deste bloco
    expect(revalidar).toHaveBeenCalledWith(`/catalogo/p1`);
    expect(revalidar).toHaveBeenCalledWith("/catalogo");
    expect(revalidar).toHaveBeenCalledWith("/");
  });
});
