"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podeAdministrar, podeGerirAdmins, podeGerirConsorcios } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { CARGOS_PRIVILEGIADOS } from "@/lib/auth/perfis";

export type ResultadoAcao = { ok: boolean; erro?: string };

const PERFIS_VALIDOS = ["superadmin", "admin", "sgi", "diretoria", "area", "colaborador"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ehGestor = (p?: string) => p === "superadmin" || p === "admin";

// Escopo do Gestor de Setor: só pode agir sobre usuários que compartilham algum setor.
async function alvoNoEscopoGestor(atorSetores: string[], usuarioId: string): Promise<boolean> {
  const alvo = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { setores: { select: { id: true } } },
  });
  if (!alvo) return false;
  return alvo.setores.some((s) => atorSetores.includes(s.id));
}

// Convidar usuário: cria registro (= libera acesso) + vincula setores. Super/Admin.
export async function convidarUsuario(
  nome: string,
  email: string,
  perfil: string,
  setores: string[],
): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!atual || !ehGestor(atual.perfil)) return { ok: false, erro: "Sem permissão para convidar." };

  const nomeT = nome.trim();
  const emailT = email.trim().toLowerCase();
  if (!nomeT) return { ok: false, erro: "Informe o nome." };
  if (!EMAIL_RE.test(emailT)) return { ok: false, erro: "E-mail inválido." };
  if (!PERFIS_VALIDOS.includes(perfil)) return { ok: false, erro: "Cargo inválido." };
  if (CARGOS_PRIVILEGIADOS.includes(perfil) && !podeGerirAdmins(atual)) {
    return { ok: false, erro: "Apenas Super Admin pode atribuir Admin/Super Admin." };
  }

  const jaExiste = await prisma.usuario.findUnique({ where: { email: emailT } });
  if (jaExiste) return { ok: false, erro: "Já existe um usuário com esse e-mail." };

  const criado = await prisma.usuario.create({
    data: {
      email: emailT,
      nome: nomeT,
      perfil: perfil as never,
      ativo: true,
      convidadoPor: atual.email,
      setores: setores.length ? { connect: setores.map((id) => ({ id })) } : undefined,
    },
  });
  await registrar("usuario.convidar", "Usuario", criado.id, `${emailT} como ${perfil}`);
  revalidatePath("/admin");
  return { ok: true };
}

// Alterar cargo. Super/Admin. Cargos privilegiados só por Super Admin.
export async function definirPerfil(usuarioId: string, perfil: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!atual || !ehGestor(atual.perfil)) return { ok: false, erro: "Sem permissão." };
  if (!PERFIS_VALIDOS.includes(perfil)) return { ok: false, erro: "Cargo inválido." };
  if (atual.id === usuarioId) return { ok: false, erro: "Você não pode alterar o próprio cargo." };

  const alvo = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  // Mexer em (ou promover a) cargo privilegiado exige Super Admin.
  if ((CARGOS_PRIVILEGIADOS.includes(perfil) || CARGOS_PRIVILEGIADOS.includes(alvo.perfil)) && !podeGerirAdmins(atual)) {
    return { ok: false, erro: "Apenas Super Admin gerencia cargos de Admin/Super Admin." };
  }

  await prisma.usuario.update({ where: { id: usuarioId }, data: { perfil: perfil as never } });
  await registrar("usuario.perfil", "Usuario", usuarioId, `→ ${perfil}`);
  revalidatePath("/admin");
  return { ok: true };
}

// Vincular setores (N:N). Super/Admin em qualquer usuário; Gestor de Setor só em usuários do seu escopo.
export async function definirSetores(usuarioId: string, setores: string[]): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeAdministrar(atual)) return { ok: false, erro: "Sem permissão." };
  if (!ehGestor(atual!.perfil)) {
    // Gestor de Setor: só usuários do próprio escopo.
    const ok = await alvoNoEscopoGestor(atual!.setores, usuarioId);
    if (!ok) return { ok: false, erro: "Fora do seu escopo de setor." };
  }
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { setores: { set: setores.map((id) => ({ id })) } },
  });
  await registrar("usuario.setores", "Usuario", usuarioId, `${setores.length} setor(es)`);
  revalidatePath("/admin");
  return { ok: true };
}

// Vincular consórcios (N:N). Só Super Admin — mesma régua do CRUD de consórcio
// (não existe "Gestor de Consórcio" nesta versão; diferente de definirSetores,
// que usa podeAdministrar porque Gestor de Setor pode gerir seu próprio setor).
export async function definirConsorcios(usuarioId: string, consorcios: string[]): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { consorcios: { set: consorcios.map((id) => ({ id })) } },
  });
  await registrar("usuario.consorcios", "Usuario", usuarioId, `${consorcios.length} consórcio(s)`);
  revalidatePath("/admin");
  return { ok: true };
}

// Ativar/desativar. Super/Admin (qualquer, menos si); Gestor de Setor só no seu escopo.
export async function alternarAtivo(usuarioId: string, ativo: boolean): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeAdministrar(atual)) return { ok: false, erro: "Sem permissão." };
  if (atual!.id === usuarioId && !ativo) return { ok: false, erro: "Você não pode desativar a si mesmo." };
  if (!ehGestor(atual!.perfil)) {
    const ok = await alvoNoEscopoGestor(atual!.setores, usuarioId);
    if (!ok) return { ok: false, erro: "Fora do seu escopo de setor." };
  }
  await prisma.usuario.update({ where: { id: usuarioId }, data: { ativo } });
  await registrar("usuario.ativo", "Usuario", usuarioId, ativo ? "ativado" : "desativado");
  revalidatePath("/admin");
  return { ok: true };
}

// Remover. Super/Admin. Não pode remover a si mesmo nem cargo privilegiado (salvo Super Admin).
export async function removerUsuario(usuarioId: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!atual || !ehGestor(atual.perfil)) return { ok: false, erro: "Sem permissão." };
  if (atual.id === usuarioId) return { ok: false, erro: "Você não pode remover a si mesmo." };

  const alvo = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  if (CARGOS_PRIVILEGIADOS.includes(alvo.perfil) && !podeGerirAdmins(atual)) {
    return { ok: false, erro: "Apenas Super Admin remove Admin/Super Admin." };
  }
  await prisma.usuario.delete({ where: { id: usuarioId } });
  await registrar("usuario.remover", "Usuario", usuarioId, alvo.email);
  revalidatePath("/admin");
  return { ok: true };
}
