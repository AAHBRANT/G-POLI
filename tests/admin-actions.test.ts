import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeAdministrar: vi.fn(),
  podeGerirAdmins: vi.fn(),
  podeGerirConsorcios: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({
  registrar: vi.fn(),
}));

vi.mock("@/lib/politica/reconciliarPendencias", () => ({
  reconciliarPendenciasNovoUsuario: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeAdministrar, podeGerirAdmins, podeGerirConsorcios } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { reconciliarPendenciasNovoUsuario } from "@/lib/politica/reconciliarPendencias";
import {
  convidarUsuario,
  definirPerfil,
  definirSetores,
  alternarAtivo,
  removerUsuario,
  definirConsorcios,
} from "@/app/(shell)/admin/actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const administrar = podeAdministrar as ReturnType<typeof vi.fn>;
const gerirAdmins = podeGerirAdmins as ReturnType<typeof vi.fn>;
const gerirConsorcios = podeGerirConsorcios as ReturnType<typeof vi.fn>;
const findUnique = prisma.usuario.findUnique as ReturnType<typeof vi.fn>;
const create = prisma.usuario.create as ReturnType<typeof vi.fn>;
const update = prisma.usuario.update as ReturnType<typeof vi.fn>;
const del = prisma.usuario.delete as ReturnType<typeof vi.fn>;
const reconciliar = reconciliarPendenciasNovoUsuario as ReturnType<typeof vi.fn>;

const admin = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "admin-1",
  email: "admin@empresa.com",
  perfil: "admin",
  setores: [] as string[],
  ...over,
});

const gestorSetor = (setores: string[]) => ({
  id: "gestor-1",
  email: "gestor@empresa.com",
  perfil: "area",
  setores,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("convidarUsuario", () => {
  it("bloqueia quem não é gestor (admin/superadmin)", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor([]));
    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", []);
    expect(r).toEqual({ ok: false, erro: "Sem permissão para convidar." });
    expect(create).not.toHaveBeenCalled();
  });

  it("bloqueia quando não há usuário atual", async () => {
    usuarioAtual.mockResolvedValue(null);
    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", []);
    expect(r.ok).toBe(false);
  });

  it("rejeita nome vazio", async () => {
    usuarioAtual.mockResolvedValue(admin());
    const r = await convidarUsuario("   ", "fulano@empresa.com", "colaborador", []);
    expect(r).toEqual({ ok: false, erro: "Informe o nome." });
  });

  it("rejeita e-mail inválido", async () => {
    usuarioAtual.mockResolvedValue(admin());
    const r = await convidarUsuario("Fulano", "nao-e-email", "colaborador", []);
    expect(r).toEqual({ ok: false, erro: "E-mail inválido." });
  });

  it("rejeita cargo inválido", async () => {
    usuarioAtual.mockResolvedValue(admin());
    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "gerente", []);
    expect(r).toEqual({ ok: false, erro: "Cargo inválido." });
  });

  it("exige Super Admin para atribuir cargo privilegiado", async () => {
    usuarioAtual.mockResolvedValue(admin());
    gerirAdmins.mockReturnValue(false);
    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "admin", []);
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin pode atribuir Admin/Super Admin." });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejeita e-mail já cadastrado", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue({ id: "x" });
    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", []);
    expect(r).toEqual({ ok: false, erro: "Já existe um usuário com esse e-mail." });
  });

  it("cria o usuário, registra auditoria e revalida a página em caso de sucesso", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "novo-1" });

    const r = await convidarUsuario(" Fulano ", " Fulano@Empresa.com ", "colaborador", ["setor-1"]);

    expect(r).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      data: {
        email: "fulano@empresa.com",
        nome: "Fulano",
        perfil: "colaborador",
        ativo: true,
        convidadoPor: "admin@empresa.com",
        setores: { connect: [{ id: "setor-1" }] },
      },
    });
    expect(registrar).toHaveBeenCalledWith("usuario.convidar", "Usuario", "novo-1", "fulano@empresa.com como colaborador");
  });
});

describe("convidarUsuario — reconciliação de pendência", () => {
  beforeEach(() => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "novo-1", oid: null, nome: "Fulano", email: "fulano@empresa.com" });
  });

  it("chama reconciliarPendenciasNovoUsuario com o usuário criado e os setores do convite", async () => {
    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", ["setor-ti"]);

    expect(r).toEqual({ ok: true });
    expect(reconciliar).toHaveBeenCalledWith(
      { id: "novo-1", oid: null, nome: "Fulano", email: "fulano@empresa.com" },
      ["setor-ti"],
    );
  });
});

describe("definirPerfil", () => {
  it("bloqueia quem não é gestor", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor([]));
    const r = await definirPerfil("alvo-1", "sgi");
    expect(r).toEqual({ ok: false, erro: "Sem permissão." });
  });

  it("rejeita cargo inválido", async () => {
    usuarioAtual.mockResolvedValue(admin());
    const r = await definirPerfil("alvo-1", "gerente");
    expect(r).toEqual({ ok: false, erro: "Cargo inválido." });
  });

  it("impede alterar o próprio cargo", async () => {
    const atual = admin();
    usuarioAtual.mockResolvedValue(atual);
    const r = await definirPerfil(atual.id, "sgi");
    expect(r).toEqual({ ok: false, erro: "Você não pode alterar o próprio cargo." });
  });

  it("rejeita quando o usuário alvo não existe", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue(null);
    const r = await definirPerfil("alvo-1", "sgi");
    expect(r).toEqual({ ok: false, erro: "Usuário não encontrado." });
  });

  it("exige Super Admin para mexer em cargo privilegiado (novo ou atual)", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue({ id: "alvo-1", perfil: "colaborador" });
    gerirAdmins.mockReturnValue(false);
    const r = await definirPerfil("alvo-1", "admin");
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia cargos de Admin/Super Admin." });
    expect(update).not.toHaveBeenCalled();
  });

  it("atualiza o cargo e registra auditoria em caso de sucesso", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue({ id: "alvo-1", perfil: "colaborador" });
    const r = await definirPerfil("alvo-1", "sgi");
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "alvo-1" }, data: { perfil: "sgi" } });
    expect(registrar).toHaveBeenCalledWith("usuario.perfil", "Usuario", "alvo-1", "→ sgi");
  });
});

describe("definirSetores", () => {
  it("bloqueia quem não pode administrar", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor(["setor-1"]));
    administrar.mockReturnValue(false);
    const r = await definirSetores("alvo-1", ["setor-2"]);
    expect(r).toEqual({ ok: false, erro: "Sem permissão." });
  });

  it("gestor de setor não pode agir fora do seu escopo", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor(["setor-1"]));
    administrar.mockReturnValue(true);
    findUnique.mockResolvedValue({ setores: [{ id: "setor-2" }] });
    const r = await definirSetores("alvo-1", ["setor-3"]);
    expect(r).toEqual({ ok: false, erro: "Fora do seu escopo de setor." });
    expect(update).not.toHaveBeenCalled();
  });

  it("gestor de setor age dentro do seu escopo", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor(["setor-1"]));
    administrar.mockReturnValue(true);
    findUnique.mockResolvedValue({ setores: [{ id: "setor-1" }] });
    const r = await definirSetores("alvo-1", ["setor-1", "setor-2"]);
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: "alvo-1" },
      data: { setores: { set: [{ id: "setor-1" }, { id: "setor-2" }] } },
    });
  });

  it("admin/superadmin não tem o escopo verificado", async () => {
    usuarioAtual.mockResolvedValue(admin());
    administrar.mockReturnValue(true);
    const r = await definirSetores("alvo-1", ["setor-1"]);
    expect(r).toEqual({ ok: true });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("alternarAtivo", () => {
  it("bloqueia quem não pode administrar", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor([]));
    administrar.mockReturnValue(false);
    const r = await alternarAtivo("alvo-1", false);
    expect(r).toEqual({ ok: false, erro: "Sem permissão." });
  });

  it("impede desativar a si mesmo", async () => {
    const atual = admin();
    usuarioAtual.mockResolvedValue(atual);
    administrar.mockReturnValue(true);
    const r = await alternarAtivo(atual.id, false);
    expect(r).toEqual({ ok: false, erro: "Você não pode desativar a si mesmo." });
  });

  it("gestor de setor não pode agir fora do seu escopo", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor(["setor-1"]));
    administrar.mockReturnValue(true);
    findUnique.mockResolvedValue({ setores: [{ id: "setor-2" }] });
    const r = await alternarAtivo("alvo-1", true);
    expect(r).toEqual({ ok: false, erro: "Fora do seu escopo de setor." });
  });

  it("ativa/desativa e registra auditoria em caso de sucesso", async () => {
    usuarioAtual.mockResolvedValue(admin());
    administrar.mockReturnValue(true);
    const r = await alternarAtivo("alvo-1", true);
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "alvo-1" }, data: { ativo: true } });
    expect(registrar).toHaveBeenCalledWith("usuario.ativo", "Usuario", "alvo-1", "ativado");
  });
});

describe("removerUsuario", () => {
  it("bloqueia quem não é gestor", async () => {
    usuarioAtual.mockResolvedValue(gestorSetor([]));
    const r = await removerUsuario("alvo-1");
    expect(r).toEqual({ ok: false, erro: "Sem permissão." });
  });

  it("impede remover a si mesmo", async () => {
    const atual = admin();
    usuarioAtual.mockResolvedValue(atual);
    const r = await removerUsuario(atual.id);
    expect(r).toEqual({ ok: false, erro: "Você não pode remover a si mesmo." });
  });

  it("rejeita quando o usuário alvo não existe", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue(null);
    const r = await removerUsuario("alvo-1");
    expect(r).toEqual({ ok: false, erro: "Usuário não encontrado." });
  });

  it("exige Super Admin para remover cargo privilegiado", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue({ id: "alvo-1", perfil: "admin", email: "outro@empresa.com" });
    gerirAdmins.mockReturnValue(false);
    const r = await removerUsuario("alvo-1");
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin remove Admin/Super Admin." });
    expect(del).not.toHaveBeenCalled();
  });

  it("remove o usuário e registra auditoria em caso de sucesso", async () => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue({ id: "alvo-1", perfil: "colaborador", email: "alvo@empresa.com" });
    const r = await removerUsuario("alvo-1");
    expect(r).toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "alvo-1" } });
    expect(registrar).toHaveBeenCalledWith("usuario.remover", "Usuario", "alvo-1", "alvo@empresa.com");
  });
});

describe("definirConsorcios", () => {
  it("bloqueia quem não é Super Admin", async () => {
    usuarioAtual.mockResolvedValue(admin()); // perfil "admin", não "superadmin"
    gerirConsorcios.mockReturnValue(false);
    const r = await definirConsorcios("alvo-1", ["c1"]);
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
    expect(update).not.toHaveBeenCalled();
  });

  it("define os consórcios e registra auditoria em caso de sucesso", async () => {
    usuarioAtual.mockResolvedValue(admin());
    gerirConsorcios.mockReturnValue(true);
    const r = await definirConsorcios("alvo-1", ["c1", "c2"]);
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: "alvo-1" },
      data: { consorcios: { set: [{ id: "c1" }, { id: "c2" }] } },
    });
    expect(registrar).toHaveBeenCalledWith("usuario.consorcios", "Usuario", "alvo-1", "2 consórcio(s)");
  });
});
