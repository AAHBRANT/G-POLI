"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podeGerirSetores } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

export async function criarSetor(nome: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirSetores(atual)) return { ok: false, erro: "Apenas Super Admin gerencia setores." };
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Informe o nome do setor." };
  const existe = await prisma.area.findUnique({ where: { nome: n } });
  if (existe) return { ok: false, erro: "Já existe um setor com esse nome." };

  const s = await prisma.area.create({ data: { nome: n } });
  await registrar("setor.criar", "Area", s.id, n);
  revalidatePath("/admin");
  return { ok: true };
}

export async function renomearSetor(id: string, nome: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirSetores(atual)) return { ok: false, erro: "Apenas Super Admin gerencia setores." };
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Nome inválido." };
  await prisma.area.update({ where: { id }, data: { nome: n } });
  await registrar("setor.renomear", "Area", id, n);
  revalidatePath("/admin");
  return { ok: true };
}

export async function alternarSetorAtivo(id: string, ativa: boolean): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirSetores(atual)) return { ok: false, erro: "Apenas Super Admin gerencia setores." };
  await prisma.area.update({ where: { id }, data: { ativa } });
  await registrar("setor.ativo", "Area", id, ativa ? "ativado" : "desativado");
  revalidatePath("/admin");
  return { ok: true };
}
