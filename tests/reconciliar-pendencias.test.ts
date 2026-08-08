import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findMany: vi.fn() },
    pendencia: { createMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { reconciliarPendenciasNovoUsuario } from "@/lib/politica/reconciliarPendencias";

const politicaFindMany = prisma.politica.findMany as ReturnType<typeof vi.fn>;
const pendenciaCreateMany = prisma.pendencia.createMany as ReturnType<typeof vi.fn>;

const novoUsuario = { id: "novo-1", oid: null, nome: "Fulano", email: "fulano@empresa.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconciliarPendenciasNovoUsuario", () => {
  it("cria Pendencia pra política publicada de audiência aberta", async () => {
    politicaFindMany.mockResolvedValue([
      {
        id: "pol-1",
        tipo: "politica",
        publicadaEm: new Date("2026-08-01"),
        audienciaSetores: [],
        audienciaUsuarios: [],
      },
    ]);
    pendenciaCreateMany.mockResolvedValue({ count: 1 });

    await reconciliarPendenciasNovoUsuario(novoUsuario, []);

    expect(politicaFindMany).toHaveBeenCalledWith({
      where: { estado: "publicada", consorcioId: null },
      select: {
        id: true,
        tipo: true,
        publicadaEm: true,
        audienciaSetores: { select: { id: true } },
        audienciaUsuarios: { select: { id: true } },
      },
    });
    expect(pendenciaCreateMany).toHaveBeenCalledWith({
      data: [
        {
          politicaId: "pol-1",
          usuarioId: "novo-1",
          politicaPublicadaEm: new Date("2026-08-01"),
          tipo: "politica",
          estado: "pendente",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("cria Pendencia pra política restrita ao setor do convite", async () => {
    politicaFindMany.mockResolvedValue([
      {
        id: "pol-2",
        tipo: "norma",
        publicadaEm: new Date("2026-08-02"),
        audienciaSetores: [{ id: "setor-ti" }],
        audienciaUsuarios: [],
      },
    ]);
    pendenciaCreateMany.mockResolvedValue({ count: 1 });

    await reconciliarPendenciasNovoUsuario(novoUsuario, ["setor-ti"]);

    expect(pendenciaCreateMany).toHaveBeenCalledTimes(1);
  });

  it("NÃO cria Pendencia pra política restrita a outro setor", async () => {
    politicaFindMany.mockResolvedValue([
      {
        id: "pol-3",
        tipo: "manual",
        publicadaEm: new Date("2026-08-03"),
        audienciaSetores: [{ id: "setor-rh" }],
        audienciaUsuarios: [],
      },
    ]);

    await reconciliarPendenciasNovoUsuario(novoUsuario, ["setor-ti"]);

    expect(pendenciaCreateMany).not.toHaveBeenCalled();
  });

  it("sem política publicada nenhuma, não chama createMany", async () => {
    politicaFindMany.mockResolvedValue([]);

    await reconciliarPendenciasNovoUsuario(novoUsuario, []);

    expect(pendenciaCreateMany).not.toHaveBeenCalled();
  });

  it("falha ao buscar políticas não propaga erro (best-effort)", async () => {
    politicaFindMany.mockRejectedValueOnce(new Error("db fora do ar"));

    await expect(reconciliarPendenciasNovoUsuario(novoUsuario, [])).resolves.toBeUndefined();
  });

  it("política restrita só a usuários específicos (audienciaSetores vazio) NÃO conta como aberta a todos", async () => {
    politicaFindMany.mockResolvedValue([
      {
        id: "pol-4",
        tipo: "politica",
        publicadaEm: new Date("2026-08-04"),
        audienciaSetores: [],
        audienciaUsuarios: [{ id: "outro-usuario" }],
      },
    ]);

    await reconciliarPendenciasNovoUsuario(novoUsuario, []);

    expect(pendenciaCreateMany).not.toHaveBeenCalled();
  });
});
