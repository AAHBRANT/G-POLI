import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    secao: {
      findUnique: vi.fn(),
    },
    comentario: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({
  registrar: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import {
  criarComentario,
  responderComentario,
  alternarResolvidoComentario,
} from "@/app/(shell)/catalogo/[id]/comentario-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const secaoFindUnique = prisma.secao.findUnique as ReturnType<typeof vi.fn>;
const comentarioCreate = prisma.comentario.create as ReturnType<typeof vi.fn>;
const comentarioUpdate = prisma.comentario.update as ReturnType<typeof vi.fn>;
const comentarioFindUnique = prisma.comentario.findUnique as ReturnType<typeof vi.fn>;

const sgi = { id: "u1", email: "sgi@aahbrant.com", nome: "SGI", perfil: "sgi", setores: [], consorcios: [] };
const gestorS2 = { id: "u2", email: "gestor@aahbrant.com", nome: "Gestor", perfil: "area", setores: ["s2"], consorcios: [] };
const diretoria = { id: "u3", email: "dir@aahbrant.com", nome: "Diretor", perfil: "diretoria", setores: [], consorcios: [] };

const secaoRascunho = (over = {}) => ({
  id: "sec1",
  codigo: "1",
  politicaId: "pol1",
  politica: { id: "pol1", areaId: "s1", estado: "rascunho" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("criarComentario", () => {
  it("cria comentário raiz quando o usuário pode comentar a seção", async () => {
    secaoFindUnique.mockResolvedValue(secaoRascunho());
    usuarioAtual.mockResolvedValue(sgi);

    const r = await criarComentario("sec1", { paragrafoIndex: 2, trechoAncora: "texto do parágrafo", texto: "Revisar isso" });

    expect(r.ok).toBe(true);
    expect(comentarioCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        secaoId: "sec1",
        paragrafoIndex: 2,
        trechoAncora: "texto do parágrafo",
        texto: "Revisar isso",
        autorNome: "SGI",
        autorEmail: "sgi@aahbrant.com",
      }),
    });
  });

  it("bloqueia gestor de setor fora da área da política", async () => {
    secaoFindUnique.mockResolvedValue(secaoRascunho());
    usuarioAtual.mockResolvedValue(gestorS2); // seção é da área s1

    const r = await criarComentario("sec1", { paragrafoIndex: 0, trechoAncora: "x", texto: "y" });

    expect(r.ok).toBe(false);
    expect(comentarioCreate).not.toHaveBeenCalled();
  });

  it("rejeita comentário vazio (só espaços)", async () => {
    secaoFindUnique.mockResolvedValue(secaoRascunho());
    usuarioAtual.mockResolvedValue(sgi);

    const r = await criarComentario("sec1", { paragrafoIndex: 0, trechoAncora: "x", texto: "   " });

    expect(r.ok).toBe(false);
    expect(comentarioCreate).not.toHaveBeenCalled();
  });

  it("bloqueia comentário em política já publicada", async () => {
    secaoFindUnique.mockResolvedValue(secaoRascunho({ politica: { id: "pol1", areaId: "s1", estado: "publicada" } }));
    usuarioAtual.mockResolvedValue(sgi);

    const r = await criarComentario("sec1", { paragrafoIndex: 0, trechoAncora: "x", texto: "y" });

    expect(r.ok).toBe(false);
  });

  it("seção inexistente retorna erro sem chamar create", async () => {
    secaoFindUnique.mockResolvedValue(null);
    usuarioAtual.mockResolvedValue(sgi);

    const r = await criarComentario("naoexiste", { paragrafoIndex: 0, trechoAncora: "x", texto: "y" });

    expect(r.ok).toBe(false);
    expect(comentarioCreate).not.toHaveBeenCalled();
  });
});

describe("responderComentario", () => {
  const paiRaiz = {
    id: "c1",
    secaoId: "sec1",
    paragrafoIndex: 3,
    trechoAncora: "trecho ancora",
    respostaDeId: null,
    secao: secaoRascunho(),
  };

  it("resposta herda seção/parágrafo do pai e aninha no comentário raiz", async () => {
    comentarioFindUnique.mockResolvedValue(paiRaiz);
    usuarioAtual.mockResolvedValue(diretoria);

    const r = await responderComentario("c1", "Concordo, ajustar.");

    expect(r.ok).toBe(true);
    expect(comentarioCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        secaoId: "sec1",
        paragrafoIndex: 3,
        trechoAncora: "trecho ancora",
        respostaDeId: "c1",
      }),
    });
  });

  it("resposta a uma resposta aninha no comentário raiz, não na resposta", async () => {
    const respostaExistente = { ...paiRaiz, id: "c2", respostaDeId: "c1" };
    comentarioFindUnique.mockResolvedValue(respostaExistente);
    usuarioAtual.mockResolvedValue(diretoria);

    await responderComentario("c2", "Mais um comentário na mesma thread.");

    expect(comentarioCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ respostaDeId: "c1" }),
    });
  });

  it("bloqueia resposta de quem não pode comentar a seção", async () => {
    comentarioFindUnique.mockResolvedValue(paiRaiz);
    usuarioAtual.mockResolvedValue(gestorS2);

    const r = await responderComentario("c1", "Tentando responder.");

    expect(r.ok).toBe(false);
    expect(comentarioCreate).not.toHaveBeenCalled();
  });
});

describe("alternarResolvidoComentario", () => {
  const comentarioDoGestor = {
    id: "c1",
    secaoId: "sec1",
    autorEmail: "gestor@aahbrant.com",
    secao: secaoRascunho({ politica: { id: "pol1", areaId: "s2", estado: "rascunho" } }),
  };

  it("autor resolve o próprio comentário mesmo sem poder editar a seção", async () => {
    comentarioFindUnique.mockResolvedValue(comentarioDoGestor);
    usuarioAtual.mockResolvedValue(gestorS2);

    const r = await alternarResolvidoComentario("c1", true);

    expect(r.ok).toBe(true);
    expect(comentarioUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ resolvido: true, resolvidoPorNome: "Gestor" }),
    });
  });

  it("reabrir limpa resolvidoPorNome/resolvidoEm", async () => {
    comentarioFindUnique.mockResolvedValue(comentarioDoGestor);
    usuarioAtual.mockResolvedValue(gestorS2);

    await alternarResolvidoComentario("c1", false);

    expect(comentarioUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { resolvido: false, resolvidoPorNome: null, resolvidoEm: null },
    });
  });

  it("diretoria não resolve comentário alheio (não é dona do conteúdo)", async () => {
    comentarioFindUnique.mockResolvedValue(comentarioDoGestor);
    usuarioAtual.mockResolvedValue(diretoria);

    const r = await alternarResolvidoComentario("c1", true);

    expect(r.ok).toBe(false);
    expect(comentarioUpdate).not.toHaveBeenCalled();
  });

  it("sgi resolve comentário de qualquer um (edita o conteúdo)", async () => {
    comentarioFindUnique.mockResolvedValue(comentarioDoGestor);
    usuarioAtual.mockResolvedValue(sgi);

    const r = await alternarResolvidoComentario("c1", true);

    expect(r.ok).toBe(true);
  });
});
