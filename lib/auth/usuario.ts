import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { lerSessao } from "./session";
import { authEnabled, adminEmails, acessoAberto, ehDominioOrg, dominiosOrg } from "./config";
import { type Perfil, type UsuarioAtual, regraAcesso } from "./rbac";

// Reexporta tipos + regras puras (compat: outros módulos importam daqui).
export * from "./rbac";

const DEV_PERFIL_COOKIE = "gpol_dev_perfil";

// Acesso: busca o registro no banco e delega a decisão para a regra pura (rbac.regraAcesso).
export async function temAcesso(email: string): Promise<boolean> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (adminEmails.includes(e)) return true;
  const u = await prisma.usuario.findUnique({ where: { email: e } });
  return regraAcesso({
    email: e,
    adminEmails,
    acessoAberto,
    dominios: dominiosOrg,
    registro: u ? { ativo: u.ativo } : null,
  });
}

// Provisiona/atualiza no login. Reconcilia por e-mail (convidado ainda sem oid).
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
  // Novo: bootstrap → superadmin; modo aberto + domínio da org → colaborador.
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
