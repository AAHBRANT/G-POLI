import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { pendencia: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { marcarPendenciaNotificada } from "@/app/(shell)/pendencia-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const pendenciaUpdate = prisma.pendencia.update as ReturnType<typeof vi.fn>;

describe("marcarPendenciaNotificada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca notificadaEm filtrando pelo id da pendencia E usuarioId da sessao (evita IDOR)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    pendenciaUpdate.mockResolvedValue({});

    await marcarPendenciaNotificada("pend1");

    expect(pendenciaUpdate).toHaveBeenCalledWith({
      where: { id: "pend1", usuarioId: "u1" },
      data: { notificadaEm: expect.any(Date) },
    });
  });

  it("sem sessao (ou sem usuario.id), nao chama o banco", async () => {
    usuarioAtual.mockResolvedValue(null);
    await marcarPendenciaNotificada("pend1");
    expect(pendenciaUpdate).not.toHaveBeenCalled();
  });

  it("falha do update (pendencia de outro usuario, P2025) nao lanca (best-effort)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    pendenciaUpdate.mockRejectedValue(new Error("Record to update not found."));

    await expect(marcarPendenciaNotificada("pend1")).resolves.toBeUndefined();
  });
});
