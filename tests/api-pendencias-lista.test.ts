import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { pendencia: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { GET } from "@/app/api/pendencias/lista/route";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const findMany = prisma.pendencia.findMany as ReturnType<typeof vi.fn>;

describe("GET /api/pendencias/lista", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna as pendencias do usuario autenticado, mais recentes primeiro", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    const publicadaEm = new Date("2026-07-30T12:00:00.000Z");
    const criadaEm = new Date("2026-07-31T09:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "pend1",
        politicaId: "p1",
        tipo: "politica",
        politicaPublicadaEm: publicadaEm,
        criadaEm,
        notificadaEm: null,
        politica: { titulo: "Política de Teste", codigo: "AHBT-POL-TI-001" },
      },
    ]);

    const resposta = await GET();
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({
      itens: [
        {
          id: "pend1",
          politicaId: "p1",
          titulo: "Política de Teste",
          codigo: "AHBT-POL-TI-001",
          tipo: "politica",
          publicadaEm: publicadaEm.toISOString(),
          criadaEm: criadaEm.toISOString(),
          notificadaEm: null,
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { usuarioId: "u1", estado: "pendente" },
      include: { politica: { select: { titulo: true, codigo: true } } },
      orderBy: { criadaEm: "desc" },
      take: 20,
    });
  });

  it("401 sem sessao", async () => {
    usuarioAtual.mockResolvedValue(null);
    const resposta = await GET();
    expect(resposta.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("401 quando usuario nao tem id (sessao valida mas nao provisionado)", async () => {
    usuarioAtual.mockResolvedValue({ id: null, oid: "oid1" });
    const resposta = await GET();
    expect(resposta.status).toBe(401);
  });
});
