import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { lerSessao } from "./session";
import { authEnabled, adminEmails, acessoAberto, ehDominioOrg } from "./config";

export type Perfil = "superadmin" | "admin" | "sgi" | "diretoria" | "area" | "colaborador";

export type UsuarioAtual = {
  id: string | null;
  oid: string;
  nome: string;
  email: string;
  perfil: Perfil;
  setores: string[]; // ids dos setores (Area) vinculados ao usuário
};

const DEV_PERFIL_COOKIE = "gpol_dev_perfil";

// Acesso:
// - admin de bootstrap sempre entra;
// - usuário já cadastrado: respeita o flag ativo (desativado = bloqueado, mesmo no modo aberto);
// - novo usuário: modo ABERTO libera qualquer e-mail do domínio da org; modo fechado exige convite.
export async function temAcesso(email: string): Promise<boolean> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (adminEmails.includes(e)) return true;
  const u = await prisma.usuario.findUnique({ where: { email: e } });
  if (u) return u.ativo; // já existe → respeita ativo/inativo
  return acessoAberto && ehDominioOrg(e); // novo → só no modo aberto e do domínio
}

// Provisiona/atualiza o usuário no login. Reconcilia por e-mail (convidado ainda sem oid).
// E-mails de bootstrap (ADMIN_EMAILS) entram como Super Admin.
export async function provisionarUsuario(dados: {
  oid: string;
  email: string;
  nome: string;
}): Promise<void> {
  const email = dados.email.trim().toLowerCase();
  const ehBootstrap = adminEmails.includes(email);
  const existente = await prisma.usuario.findFirst({
    where: { OR: [{ oid: dados.oid }, { email }] },
  });

  if (existente) {
    await prisma.usuario.update({
      where: { id: existente.id },
      data: {
        oid: dados.oid,
        nome: dados.nome || existente.nome,
        email,
        ...(ehBootstrap ? { perfil: "superadmin", ativo: true } : {}),
      },
    });
    return;
  }
  // Novo usuário: bootstrap → superadmin; modo aberto + domínio da org → colaborador.
  if (ehBootstrap) {
    await prisma.usuario.create({
      data: { oid: dados.oid, email, nome: dados.nome, perfil: "superadmin", ativo: true },
    });
  } else if (acessoAberto && ehDominioOrg(email)) {
    await prisma.usuario.create({
      data: { oid: dados.oid, email, nome: dados.nome, perfil: "colaborador", ativo: true },
    });
  }
}

export async function getUsuarioAtual(): Promise<UsuarioAtual | null> {
  // Modo dev (auth desligada): usuário sintético; perfil via cookie para teste.
  if (!authEnabled) {
    const perfil = (cookies().get(DEV_PERFIL_COOKIE)?.value as Perfil) || "superadmin";
    let setores: string[] = [];
    if (perfil === "area") {
      const a = await prisma.area.findFirst({ orderBy: { criadoEm: "asc" } });
      if (a) setores = [a.id];
    }
    return { id: "dev", oid: "dev", nome: "Dev", email: "dev@local", perfil, setores };
  }

  const sessao = await lerSessao();
  if (!sessao) return null;
  const u = await prisma.usuario.findUnique({
    where: { oid: sessao.sub },
    include: { setores: { select: { id: true } } },
  });
  if (!u || !u.ativo) return null;
  return {
    id: u.id,
    oid: u.oid ?? sessao.sub,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil as Perfil,
    setores: u.setores.map((s) => s.id),
  };
}

// ---- Papéis auxiliares ----
const ehSuper = (u: UsuarioAtual | null) => !!u && u.perfil === "superadmin";
const ehAdminOuSuper = (u: UsuarioAtual | null) => !!u && (u.perfil === "admin" || u.perfil === "superadmin");
const noSetor = (u: UsuarioAtual | null, areaId: string) => !!u && u.setores.includes(areaId);

// ---- Permissões ----

// Acessar o módulo de administração (usuários): Super Admin, Admin ou Gestor de Setor.
export function podeAdministrar(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "superadmin" || u.perfil === "admin" || u.perfil === "area");
}

// Gerir setores e regras gerais + promover/rebaixar admins: só Super Admin.
export function podeGerirSetores(u: UsuarioAtual | null): boolean {
  return ehSuper(u);
}
export function podeGerirAdmins(u: UsuarioAtual | null): boolean {
  return ehSuper(u);
}

// Criar política: SGI, admin ou super.
export function podeCriarPolitica(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "sgi" || ehAdminOuSuper(u));
}

// Editar conteúdo de uma política (rascunho). SGI/admin/super: todas. Área: só setores do usuário.
export function podeEditarConteudo(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
): boolean {
  if (!u) return false;
  if (politica.estado !== "rascunho") return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId);
  return false;
}

// Editar UMA seção. SGI/admin/super: qualquer. Área: setor do usuário + seção liberada.
export function podeEditarSecao(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
  secao: { abertaAArea: boolean },
): boolean {
  if (!u) return false;
  if (politica.estado !== "rascunho") return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId) && secao.abertaAArea;
  return false;
}

// Liberar seções à área: SGI/admin/super.
export function podeGerirAberturaArea(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "sgi" || ehAdminOuSuper(u));
}

// Publicar: Diretoria, admin ou super.
export function podePublicar(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "diretoria" || ehAdminOuSuper(u));
}

// Visibilidade (busca/catálogo). super/admin/sgi/diretoria: tudo. area: publicadas + seus setores. resto: publicadas.
export function filtroVisibilidade(u: UsuarioAtual | null): Record<string, unknown> {
  if (u && (ehAdminOuSuper(u) || u.perfil === "sgi" || u.perfil === "diretoria")) return {};
  if (u && u.perfil === "area" && u.setores.length) {
    return { OR: [{ estado: "publicada" }, { areaId: { in: u.setores } }] };
  }
  return { estado: "publicada" };
}
