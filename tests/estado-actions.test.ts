import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn(), update: vi.fn() },
    pendencia: { createMany: vi.fn(), updateMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    consorcio: { findUnique: vi.fn() }, // NOVO (Task 8) — membros do consórcio quando politica.consorcioId
    notificacao: { create: vi.fn() }, // NOVO (Task 8) — o teste novo asserta chamadas diretas a este mock
    versao: { findMany: vi.fn() }, // NOVO — busca de Versao anteriores pro Controle de Revisões
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
vi.mock("@/lib/politica/gerarPdf", () => ({ gerarPdfOficial: vi.fn() }));

vi.mock("@/lib/politica/pendencia", () => ({ dadosPendencia: vi.fn() }));

vi.mock("@/lib/politica/ai", () => ({ gerarDescricaoRevisao: vi.fn() }));
vi.mock("@/lib/politica/indiceServidor", () => ({ reindexarPolitica: vi.fn(), removerIndice: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { revalidatePath } from "next/cache";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import { gerarPdfOficial } from "@/lib/politica/gerarPdf";
import { dadosPendencia } from "@/lib/politica/pendencia";
import { gerarDescricaoRevisao } from "@/lib/politica/ai";
import { reindexarPolitica, removerIndice } from "@/lib/politica/indiceServidor";
import { publicarPolitica, revogarPolitica } from "@/app/(shell)/catalogo/[id]/estado-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const publicarPermitido = podePublicar as ReturnType<typeof vi.fn>;
const notificar = enviarNotificacaoPoliticaPublicada as ReturnType<typeof vi.fn>;
const salvar = salvarArquivo as ReturnType<typeof vi.fn>;
const gerar = gerarDocumentoOficial as ReturnType<typeof vi.fn>;
const gerarPdf = gerarPdfOficial as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const politicaUpdate = prisma.politica.update as ReturnType<typeof vi.fn>;
const transacao = prisma.$transaction as ReturnType<typeof vi.fn>;
const auditoriaRegistrar = registrar as ReturnType<typeof vi.fn>;
const revalidar = revalidatePath as ReturnType<typeof vi.fn>;
const dadosPendenciaMock = dadosPendencia as ReturnType<typeof vi.fn>;
const pendenciaCreateMany = prisma.pendencia.createMany as ReturnType<typeof vi.fn>;
const pendenciaUpdateMany = prisma.pendencia.updateMany as ReturnType<typeof vi.fn>;
const usuarioFindMany = prisma.usuario.findMany as ReturnType<typeof vi.fn>;
const versaoFindMany = prisma.versao.findMany as ReturnType<typeof vi.fn>;
const descricaoIA = gerarDescricaoRevisao as ReturnType<typeof vi.fn>;

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
    consorcioId: null,      // NOVO (Task 8) — sem consórcio, cai na audiência por setor/usuário
  };
}

describe("publicarPolitica — geração do documento oficial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Teste", email: "teste@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    gerarPdf.mockResolvedValue(Buffer.from("%PDF-fake"));
    versaoCount.mockResolvedValue(0);
    versaoFindMany.mockResolvedValue([]); // NOVO — sem versões anteriores por padrão
    // NOVO — resolverAudiencia (extraída neste task) agora roda incondicionalmente
    // em publicarPolitica, fora do try/catch best-effort; sem este default, o
    // findMany() sem mock retorna undefined e resolverAudiencia lança ao tentar
    // `.map`, quebrando estes testes que não sao sobre audiência/notificação.
    usuarioFindMany.mockResolvedValue([]);
    // $transaction é chamado de 2 formas nesta suíte: callback (transação de
    // versão/documento, aqui) e array (cancel+create de Pendencia, em
    // criarPendencias) — o mock precisa suportar as duas.
    transacao.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<void>)({
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
    // .docx oficial + PDF oficial (derivado do mesmo conteúdo congelado)
    expect(versaoCreate).toHaveBeenCalledTimes(2);
    expect(versaoCreate.mock.calls[0][0].data.documento.create.oficial).toBe(true);
    expect(versaoCreate.mock.calls[1][0].data.documento.create).toMatchObject({ oficial: true, tipo: "application/pdf" });
    // Invariante central: só a cadeia de documentos OFICIAIS é substituída.
    // Se o filtro `documento: { oficial: true }` sumisse do where, TODOS os
    // anexos manuais seriam marcados "substituida" a cada publicação.
    expect(versaoUpdateMany.mock.calls[0][0].where).toMatchObject({
      documento: { oficial: true },
    });
  });

  it("falha ao gerar o PDF NÃO cancela a publicação (segue só com o .docx)", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    gerarPdf.mockRejectedValue(new Error("pdf quebrou"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(versaoCreate).toHaveBeenCalledTimes(1);
  });

  it("grava conteudoSnapshot e revisaoNaEpoca na nova versão", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    const dataVersao = versaoCreate.mock.calls[0][0].data;
    expect(dataVersao.conteudoSnapshot).toEqual(politicaBase().secoes.map((s) => ({
      codigo: s.codigo,
      titulo: s.titulo,
      tipo: s.tipo,
      corpo: s.corpo,
      colunas: s.colunas ?? null,
      linhas: s.linhas ?? null,
    })));
    expect(dataVersao.revisaoNaEpoca).toBe(0); // politicaBase().revisao = 0, publicadaEm = null → novaRevisao = revisao (0)
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

  it("politica com consorcioId: notifica só os membros do consórcio, ignora audienciaSetores/Usuarios", async () => {
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    findUnique.mockResolvedValue({
      ...politicaBase(),
      consorcioId: "c1",
      audienciaSetores: [{ id: "s1", membros: [{ id: "u-fora", oid: "o-fora", nome: "Fora", email: "fora@x.com", ativo: true }] }],
      audienciaUsuarios: [],
    });

    // Candidatos = usuários vinculados ao consórcio (a consulta filtra por consorcios.some).
    usuarioFindMany.mockResolvedValue([
      { id: "u-consorcio", oid: "o-consorcio", nome: "Do Consórcio", email: "consorcio@x.com", perfil: "colaborador", ativo: true, setores: [], consorcios: [{ id: "c1" }] },
    ]);

    await publicarPolitica("p1");

    expect(usuarioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ consorcios: { some: { id: "c1" } } }) }),
    );
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usuarioEmail: "consorcio@x.com" }) }),
    );
    expect(prisma.notificacao.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usuarioEmail: "fora@x.com" }) }),
    );
  });
});

describe("publicarPolitica — Controle de Revisões", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Fulano de Tal", email: "fulano@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    usuarioFindMany.mockResolvedValue([]);
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    transacao.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<void>)({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
  });

  it("primeira publicação: 1 linha fixa 'Emissão inicial do documento', sem chamar a IA", async () => {
    findUnique.mockResolvedValue(politicaBase());
    versaoFindMany.mockResolvedValue([]);

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(descricaoIA).not.toHaveBeenCalled();
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes).toEqual([
      { revisao: "00", data: expect.any(String), descricao: "Emissão inicial do documento", responsavel: "Fulano de Tal" },
    ]);
    expect(versaoCreate.mock.calls[0][0].data.descricaoAlteracao).toBe("Emissão inicial do documento");
    expect(versaoCreate.mock.calls[0][0].data.responsavelNome).toBe("Fulano de Tal");
  });

  it("republicação: usa a descrição da IA e preserva as linhas anteriores", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 0,
      conteudoPublicado: [{ codigo: "1", titulo: "Objetivo", corpo: "Texto antigo." }],
    });
    versaoFindMany.mockResolvedValue([
      // Meio-dia UTC (não meia-noite) — evita que o fuso local (ex.:
      // America/Sao_Paulo, UTC-3) empurre a data pro dia civil anterior ao
      // formatar em pt-BR; ver learnings.md.
      { revisaoNaEpoca: 0, criadaEm: new Date("2026-01-01T12:00:00.000Z"), descricaoAlteracao: "Emissão inicial do documento", responsavelNome: "Ciclano" },
    ]);
    descricaoIA.mockResolvedValue("Inclusão do item 4.2");

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(descricaoIA).toHaveBeenCalledTimes(1);
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes).toEqual([
      { revisao: "00", data: "01/01/2026", descricao: "Emissão inicial do documento", responsavel: "Ciclano" },
      { revisao: "01", data: expect.any(String), descricao: "Inclusão do item 4.2", responsavel: "Fulano de Tal" },
    ]);
    expect(versaoCreate.mock.calls[0][0].data.descricaoAlteracao).toBe("Inclusão do item 4.2");
  });

  it("republicação com IA indisponível/falha: usa o fallback genérico, não bloqueia a publicação", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 4,
      conteudoPublicado: [],
    });
    versaoFindMany.mockResolvedValue([]);
    descricaoIA.mockResolvedValue(null);

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    const dadosDocx = gerar.mock.calls[0][0];
    // versaoFindMany() vazio + publicadaEm preenchido = dado legado (Finding 3):
    // a linha "—" sintética some antes da linha nova — a nova NÃO é [0].
    expect(dadosDocx.controleRevisoes[1].descricao).toBe("Republicação — revisão 05");
  });

  it("versão anterior sem descricaoAlteracao/responsavelNome (dado antigo, pré-feature): mostra '—'", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 0,
      conteudoPublicado: [],
    });
    versaoFindMany.mockResolvedValue([
      // Meio-dia UTC — mesmo motivo do teste acima (evita virada de dia por fuso local).
      { revisaoNaEpoca: 0, criadaEm: new Date("2026-01-01T12:00:00.000Z"), descricaoAlteracao: null, responsavelNome: null },
    ]);
    descricaoIA.mockResolvedValue("Inclusão do item 4.2");

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes[0]).toEqual({ revisao: "00", data: "01/01/2026", descricao: "—", responsavel: "—" });
  });

  // Finding 1 (revisão final): anexo manual (Versao com documento.oficial:
  // false, criado via adicionarVersao) não pode poluir o Controle de
  // Revisões com uma linha fantasma. O filtro é responsabilidade do
  // Postgres/Prisma — aqui só confirmamos que a query pede o predicado certo.
  it("busca versões anteriores filtrando só documento oficial (anexo manual não entra na tabela)", async () => {
    findUnique.mockResolvedValue(politicaBase());
    versaoFindMany.mockResolvedValue([]);

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(versaoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { politicaId: "p1", documento: { oficial: true, NOT: { tipo: "application/pdf" } } } }),
    );
  });

  // Finding 3 (revisão final): política publicada antes desta feature
  // existir tem publicadaEm preenchido mas NENHUMA Versao (dado legado) —
  // sem sintetizar a linha "00", uma republicação sairia com a tabela
  // começando direto em "01".
  it("republicação de política legada sem nenhuma Versao: sintetiza a linha '00' a partir de Politica", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      // Meio-dia UTC — evita que o fuso local (ex.: America/Sao_Paulo,
      // UTC-3) empurre a data pro dia civil anterior ao formatar em pt-BR;
      // ver learnings.md e os outros usos do mesmo padrão neste arquivo.
      publicadaEm: new Date("2026-01-01T12:00:00.000Z"),
      publicadaPorNome: "Fulano Legado",
      revisao: 0,
      conteudoPublicado: [],
    });
    versaoFindMany.mockResolvedValue([]);
    descricaoIA.mockResolvedValue("Inclusão do item 4.2");

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes).toEqual([
      { revisao: "—", data: "01/01/2026", descricao: "—", responsavel: "Fulano Legado" },
      { revisao: "01", data: expect.any(String), descricao: "Inclusão do item 4.2", responsavel: "Fulano de Tal" },
    ]);
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
    transacao.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<void>)({
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
    // Atomicidade: cancel+create devem viajar juntos no mesmo $transaction([...]).
    const chamadaPendencia = transacao.mock.calls.find((c: unknown[]) => Array.isArray(c[0]));
    expect(chamadaPendencia?.[0]).toHaveLength(2);
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

describe("revogarPolitica — cancela Pendencia pendente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Teste", email: "teste@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
  });

  it("marca toda Pendencia pendente da politica como cancelada", async () => {
    findUnique.mockResolvedValue({ id: "p1", titulo: "Política de Teste", estado: "publicada" });
    politicaUpdate.mockResolvedValue({});

    const resultado = await revogarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(pendenciaUpdateMany).toHaveBeenCalledWith({
      where: { politicaId: "p1", estado: "pendente" },
      data: { estado: "cancelada" },
    });
  });
});

describe("publicarPolitica — público-alvo respeita a classificação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Fulano de Tal", email: "fulano@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    transacao.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<void>)({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
  });

  it("restrito com público-alvo vazio NÃO avisa todos: consulta só o setor dono", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      classificacao: "restrito",
      areaId: "setor-dono",
      consorcioId: null,
      audienciaSetores: [],
      audienciaUsuarios: [],
    });
    usuarioFindMany.mockResolvedValue([]);

    await publicarPolitica("p1");

    const consultas = usuarioFindMany.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(consultas.some((q) => q.includes('"ativo":true}') && !q.includes("OR"))).toBe(false); // nunca "todos os ativos"
    expect(consultas.some((q) => q.includes("setor-dono"))).toBe(true);
  });

  it("confidencial: só usuários nominais, mesmo que haja setores no público-alvo", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      classificacao: "confidencial",
      areaId: "setor-dono",
      consorcioId: null,
      audienciaSetores: [{ id: "s1" }],
      audienciaUsuarios: [{ id: "u-nominal" }],
    });
    usuarioFindMany.mockResolvedValue([]);

    await publicarPolitica("p1");

    const filtros = usuarioFindMany.mock.calls.map((c) => JSON.stringify((c[0] as { where: unknown }).where));
    expect(filtros.some((q) => q.includes("u-nominal"))).toBe(true);
    expect(filtros.some((q) => q.includes('"setores"'))).toBe(false); // setor nunca basta para confidencial
  });
});

describe("índice por seção acompanha o ciclo de vida do documento", () => {
  const reindexar = reindexarPolitica as ReturnType<typeof vi.fn>;
  const remover = removerIndice as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Fulano de Tal", email: "fulano@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    usuarioFindMany.mockResolvedValue([]);
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    transacao.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<void>)({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
    findUnique.mockResolvedValue({ ...politicaBase(), classificacao: "publico_interno", areaId: "a1", consorcioId: null, audienciaSetores: [], audienciaUsuarios: [] });
  });

  it("publicar indexa o texto oficial", async () => {
    const r = await publicarPolitica("p1");
    expect(r.ok).toBe(true);
    expect(reindexar).toHaveBeenCalledWith("p1");
  });

  it("falha ao indexar NÃO desfaz a publicação", async () => {
    reindexar.mockRejectedValue(new Error("banco fora"));
    const r = await publicarPolitica("p1");
    expect(r.ok).toBe(true);
  });

  it("revogar remove o índice", async () => {
    findUnique.mockResolvedValue({ id: "p1", titulo: "Política de Teste", estado: "publicada" });
    politicaUpdate.mockResolvedValue({});
    expect((await revogarPolitica("p1")).ok).toBe(true);
    expect(remover).toHaveBeenCalledWith("p1");
  });
});
