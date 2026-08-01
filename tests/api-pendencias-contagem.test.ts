import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { pendencia: { groupBy: vi.fn() } },
}));
vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { GET } from "@/app/api/pendencias/contagem/route";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const groupBy = prisma.pendencia.groupBy as ReturnType<typeof vi.fn>;

describe("GET /api/pendencias/contagem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna total e contagem por tipo do usuário autenticado", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    groupBy.mockResolvedValue([
      { tipo: "politica", _count: { _all: 3 } },
      { tipo: "manual", _count: { _all: 2 } },
    ]);

    const resposta = await GET();
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({ total: 5, porTipo: { politica: 3, manual: 2 } });
    expect(groupBy).toHaveBeenCalledWith({
      by: ["tipo"],
      where: { usuarioId: "u1", estado: "pendente" },
      _count: { _all: true },
    });
  });

  it("401 sem sessão", async () => {
    usuarioAtual.mockResolvedValue(null);
    const resposta = await GET();
    expect(resposta.status).toBe(401);
  });
});
