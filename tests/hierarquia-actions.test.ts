import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { politica: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));
vi.mock("@/lib/auth/usuario", async () => {
  const rbac = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
  return { getUsuarioAtual: vi.fn(), filtroVisibilidade: vi.fn(() => ({})), podeGerirVinculos: rbac.podeGerirVinculos };
});

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { definirSuperior, definirPrazoRevisao } from "@/app/(shell)/catalogo/[id]/hierarquia-actions";

const usuario = getUsuarioAtual as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const findFirst = prisma.politica.findFirst as ReturnType<typeof vi.fn>;
const update = prisma.politica.update as ReturnType<typeof vi.fn>;

const sgi = { id: "u1", oid: "o", nome: "S", email: "s@x.com", perfil: "sgi", setores: [], consorcios: [] };
const colaborador = { ...sgi, perfil: "colaborador" };

const procedimento = { id: "p1", tipo: "procedimento", areaId: "a1", estado: "publicada", publicadaEm: new Date("2026-06-15T12:00:00Z"), proximaRevisaoEm: null };

describe("definirSuperior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuario.mockResolvedValue(sgi);
    findUnique.mockResolvedValue(procedimento);
  });

  it("recusa quem não pode gerir vínculos", async () => {
    usuario.mockResolvedValue(colaborador);
    const r = await definirSuperior("p1", "pai1");
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("recusa superior que o usuário não enxerga (não existe para ele)", async () => {
    findFirst.mockResolvedValue(null);
    const r = await definirSuperior("p1", "pai1");
    expect(r).toEqual({ ok: false, erro: "Documento superior não encontrado." });
    expect(update).not.toHaveBeenCalled();
  });

  it("recusa superior de tipo não permitido", async () => {
    findFirst.mockResolvedValue({ id: "pai1", tipo: "formulario", codigo: "FOR-1", titulo: "F" });
    const r = await definirSuperior("p1", "pai1");
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("grava o superior válido, mesmo com o documento publicado (SGI)", async () => {
    findFirst.mockResolvedValue({ id: "pai1", tipo: "politica", codigo: "POL-1", titulo: "P" });
    const r = await definirSuperior("p1", "pai1");
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { paiId: "pai1" } });
  });

  it("remove o superior com null sem consultar outro documento", async () => {
    const r = await definirSuperior("p1", null);
    expect(r.ok).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { paiId: null } });
  });

  it("documento inexistente", async () => {
    findUnique.mockResolvedValue(null);
    expect((await definirSuperior("nada", null)).ok).toBe(false);
  });
});

describe("definirPrazoRevisao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuario.mockResolvedValue(sgi);
    findUnique.mockResolvedValue(procedimento);
  });

  it("recusa periodicidade fora de 1 a 60 meses", async () => {
    expect((await definirPrazoRevisao("p1", 0)).ok).toBe(false);
    expect((await definirPrazoRevisao("p1", 61)).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("recusa quem não pode gerir", async () => {
    usuario.mockResolvedValue(colaborador);
    expect((await definirPrazoRevisao("p1", 12)).ok).toBe(false);
  });

  it("publicado: recalcula a próxima revisão a partir da publicação", async () => {
    const r = await definirPrazoRevisao("p1", 24);
    expect(r.ok).toBe(true);
    const dados = update.mock.calls[0][0].data;
    expect(dados.periodicidadeRevisaoMeses).toBe(24);
    expect((dados.proximaRevisaoEm as Date).toISOString().slice(0, 10)).toBe("2028-06-15");
  });

  it("rascunho: só muda a periodicidade, sem inventar data de revisão", async () => {
    findUnique.mockResolvedValue({ ...procedimento, estado: "rascunho", publicadaEm: null });
    await definirPrazoRevisao("p1", 6);
    expect(update.mock.calls[0][0].data).toEqual({ periodicidadeRevisaoMeses: 6, proximaRevisaoEm: null });
  });
});
