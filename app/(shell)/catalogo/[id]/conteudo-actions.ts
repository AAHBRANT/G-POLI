"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ESQUELETO_PADRAO } from "@/lib/esqueleto";
import { getUsuarioAtual, podeEditarConteudo, podeEditarSecao, podeGerirAberturaArea } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

// Cria o esqueleto padrão para uma política que ainda não tem seções.
export async function gerarEsqueleto(politicaId: string): Promise<ResultadoAcao> {
  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  const usuario = await getUsuarioAtual();
  if (!podeEditarConteudo(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para editar o conteúdo desta política." };
  }

  const existentes = await prisma.secao.count({ where: { politicaId } });
  if (existentes > 0) return { ok: false, erro: "Esta política já tem conteúdo estruturado." };

  await prisma.secao.createMany({
    data: ESQUELETO_PADRAO.map((s) => ({
      politicaId,
      ordem: s.ordem,
      codigo: s.codigo,
      titulo: s.titulo,
      tipo: s.tipo,
      colunas: (s.colunas ?? undefined) as never,
      linhas: (s.tipo === "tabela" ? [] : undefined) as never,
    })),
  });

  revalidatePath(`/catalogo/${politicaId}`);
  revalidatePath(`/catalogo/${politicaId}/editar`);
  return { ok: true };
}

// Salva o conteúdo de uma seção (texto ou tabela).
export async function salvarSecao(
  secaoId: string,
  dados: { corpo?: string; linhas?: string[][] },
): Promise<ResultadoAcao> {
  const secao = await prisma.secao.findUnique({
    where: { id: secaoId },
    include: { politica: true },
  });
  if (!secao) return { ok: false, erro: "Seção não encontrada." };
  const usuario = await getUsuarioAtual();
  if (!podeEditarSecao(usuario, secao.politica, secao)) {
    return { ok: false, erro: "Sem permissão para editar esta seção." };
  }

  try {
    if (secao.tipo === "tabela") {
      await prisma.secao.update({
        where: { id: secaoId },
        data: { linhas: (dados.linhas ?? []) as never },
      });
    } else {
      await prisma.secao.update({
        where: { id: secaoId },
        data: { corpo: dados.corpo ?? "" },
      });
    }
  } catch {
    return { ok: false, erro: "Falha ao salvar a seção." };
  }

  await registrar("secao.salvar", "Secao", secaoId, `${secao.codigo} ${secao.titulo}`);
  revalidatePath(`/catalogo/${secao.politicaId}`);
  revalidatePath(`/catalogo/${secao.politicaId}/editar`);
  return { ok: true };
}

// #3b: SGI/admin libera ou tranca uma seção para o perfil "area".
export async function alternarAberturaArea(secaoId: string, aberta: boolean): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podeGerirAberturaArea(usuario)) {
    return { ok: false, erro: "Apenas SGI/admin podem liberar seções para a área." };
  }
  const secao = await prisma.secao.findUnique({ where: { id: secaoId } });
  if (!secao) return { ok: false, erro: "Seção não encontrada." };

  await prisma.secao.update({ where: { id: secaoId }, data: { abertaAArea: aberta } });
  await registrar("secao.abertura", "Secao", secaoId, `${secao.codigo} → ${aberta ? "aberta" : "trancada"}`);
  revalidatePath(`/catalogo/${secao.politicaId}/editar`);
  return { ok: true };
}
