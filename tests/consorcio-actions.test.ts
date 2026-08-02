import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    consorcio: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeGerirConsorcios: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeGerirConsorcios } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { criarConsorcio, renomearConsorcio, alternarConsorcioAtivo } from "@/app/(shell)/admin/consorcio-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const gerir = podeGerirConsorcios as ReturnType<typeof vi.fn>;
const findUnique = prisma.consorcio.findUnique as ReturnType<typeof vi.fn>;
const create = prisma.consorcio.create as ReturnType<typeof vi.fn>;
const update = prisma.consorcio.update as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("criarConsorcio", () => {
  it("bloqueia quem não é Super Admin", async () => {
    gerir.mockReturnValue(false);
    const r = await criarConsorcio("Consórcio X");
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejeita nome vazio", async () => {
    gerir.mockReturnValue(true);
    const r = await criarConsorcio("   ");
    expect(r).toEqual({ ok: false, erro: "Informe o nome do consórcio." });
  });

  it("rejeita nome duplicado", async () => {
    gerir.mockReturnValue(true);
    findUnique.mockResolvedValue({ id: "existente" });
    const r = await criarConsorcio("Consórcio X");
    expect(r).toEqual({ ok: false, erro: "Já existe um consórcio com esse nome." });
  });

  it("cria e registra auditoria", async () => {
    gerir.mockReturnValue(true);
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "novo-1" });
    const r = await criarConsorcio(" Consórcio X ");
    expect(r).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({ data: { nome: "Consórcio X" } });
    expect(registrar).toHaveBeenCalledWith("consorcio.criar", "Consorcio", "novo-1", "Consórcio X");
  });
});

describe("renomearConsorcio", () => {
  it("bloqueia quem não é Super Admin", async () => {
    gerir.mockReturnValue(false);
    const r = await renomearConsorcio("c1", "Novo nome");
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
  });

  it("renomeia e registra auditoria", async () => {
    gerir.mockReturnValue(true);
    const r = await renomearConsorcio("c1", " Novo nome ");
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nome: "Novo nome" } });
    expect(registrar).toHaveBeenCalledWith("consorcio.renomear", "Consorcio", "c1", "Novo nome");
  });
});

describe("alternarConsorcioAtivo", () => {
  it("bloqueia quem não é Super Admin", async () => {
    gerir.mockReturnValue(false);
    const r = await alternarConsorcioAtivo("c1", false);
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
  });

  it("ativa/desativa e registra auditoria", async () => {
    gerir.mockReturnValue(true);
    const r = await alternarConsorcioAtivo("c1", false);
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { ativo: false } });
    expect(registrar).toHaveBeenCalledWith("consorcio.ativo", "Consorcio", "c1", "desativado");
  });
});
