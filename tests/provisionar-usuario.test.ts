import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usuario: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/config", () => ({
  adminEmails: ["boss@aahbrant.com"],
  acessoAberto: true,
  ehDominioOrg: (email: string) => email.endsWith("@aahbrant.com"),
  dominiosOrg: ["aahbrant.com"],
  authEnabled: true,
}));

vi.mock("@/lib/politica/reconciliarPendencias", () => ({
  reconciliarPendenciasNovoUsuario: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { reconciliarPendenciasNovoUsuario } from "@/lib/politica/reconciliarPendencias";
import { provisionarUsuario } from "@/lib/auth/usuario";

const findFirst = prisma.usuario.findFirst as ReturnType<typeof vi.fn>;
const create = prisma.usuario.create as ReturnType<typeof vi.fn>;
const reconciliar = reconciliarPendenciasNovoUsuario as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionarUsuario — reconciliação no auto-provisionamento", () => {
  it("bootstrap (admin email): cria superadmin e reconcilia com setorIds vazio", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "boss-1", oid: "oid-boss", nome: "Chefe", email: "boss@aahbrant.com" });

    await provisionarUsuario({ oid: "oid-boss", email: "boss@aahbrant.com", nome: "Chefe" });

    expect(create).toHaveBeenCalledWith({
      data: { oid: "oid-boss", email: "boss@aahbrant.com", nome: "Chefe", perfil: "superadmin", ativo: true },
    });
    expect(reconciliar).toHaveBeenCalledWith(
      { id: "boss-1", oid: "oid-boss", nome: "Chefe", email: "boss@aahbrant.com" },
      [],
    );
  });

  it("acessoAberto + domínio da org: cria colaborador e reconcilia com setorIds vazio", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "colab-1", oid: "oid-colab", nome: "Fulano", email: "fulano@aahbrant.com" });

    await provisionarUsuario({ oid: "oid-colab", email: "fulano@aahbrant.com", nome: "Fulano" });

    expect(create).toHaveBeenCalledWith({
      data: { oid: "oid-colab", email: "fulano@aahbrant.com", nome: "Fulano", perfil: "colaborador", ativo: true },
    });
    expect(reconciliar).toHaveBeenCalledWith(
      { id: "colab-1", oid: "oid-colab", nome: "Fulano", email: "fulano@aahbrant.com" },
      [],
    );
  });

  it("usuário já existente: apenas atualiza, não cria nem reconcilia", async () => {
    findFirst.mockResolvedValue({ id: "existente-1", nome: "Antigo" });

    await provisionarUsuario({ oid: "oid-x", email: "fulano@aahbrant.com", nome: "Fulano" });

    expect(create).not.toHaveBeenCalled();
    expect(reconciliar).not.toHaveBeenCalled();
  });

  it("fora do domínio da org e não bootstrap: não cria nem reconcilia", async () => {
    findFirst.mockResolvedValue(null);

    await provisionarUsuario({ oid: "oid-y", email: "estranho@outraempresa.com", nome: "Estranho" });

    expect(create).not.toHaveBeenCalled();
    expect(reconciliar).not.toHaveBeenCalled();
  });
});
