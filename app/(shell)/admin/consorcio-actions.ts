"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { podeGerirConsorcios } from "@/lib/auth/usuario";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

export async function criarConsorcio(nome: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Informe o nome do consórcio." };
  const existe = await prisma.consorcio.findUnique({ where: { nome: n } });
  if (existe) return { ok: false, erro: "Já existe um consórcio com esse nome." };

  const c = await prisma.consorcio.create({ data: { nome: n } });
  await registrar("consorcio.criar", "Consorcio", c.id, n);
  revalidatePath("/admin");
  return { ok: true };
}

export async function renomearConsorcio(id: string, nome: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Nome inválido." };
  await prisma.consorcio.update({ where: { id }, data: { nome: n } });
  await registrar("consorcio.renomear", "Consorcio", id, n);
  revalidatePath("/admin");
  return { ok: true };
}

export async function alternarConsorcioAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  await prisma.consorcio.update({ where: { id }, data: { ativo } });
  await registrar("consorcio.ativo", "Consorcio", id, ativo ? "ativado" : "desativado");
  revalidatePath("/admin");
  return { ok: true };
}
