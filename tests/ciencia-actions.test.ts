import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(() => new Map()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn() },
    ciencia: { upsert: vi.fn() },
    pendencia: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));
vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { darCiencia } from "@/app/(shell)/catalogo/[id]/ciencia-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const cienciaUpsert = prisma.ciencia.upsert as ReturnType<typeof vi.fn>;
const pendenciaUpdateMany = prisma.pendencia.updateMany as ReturnType<typeof vi.fn>;

describe("darCiencia — resolve Pendencia correspondente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", oid: "oid1", nome: "Ana", email: "ana@aahbrant.com" });
    findUnique.mockResolvedValue({
      id: "p1",
      titulo: "Política de Teste",
      estado: "publicada",
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
    });
  });

  it("marca a Pendencia como resolvida com o mesmo politicaId/usuarioId/politicaPublicadaEm", async () => {
    const resultado = await darCiencia("p1", new Date(Date.now() - 10_000).toISOString());

    expect(resultado.ok).toBe(true);
    expect(pendenciaUpdateMany).toHaveBeenCalledWith({
      where: { politicaId: "p1", usuarioId: "u1", politicaPublicadaEm: new Date("2026-07-30T12:00:00Z"), estado: "pendente" },
      data: { estado: "resolvida", resolvidaEm: expect.any(Date) },
    });
  });
});
