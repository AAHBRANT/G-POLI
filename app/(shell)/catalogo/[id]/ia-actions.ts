"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podeEditarConteudo } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { gerarRascunhoNorma, type SecaoIA } from "@/lib/ai";
import { rotuloClassificacao } from "@/lib/constants";

export type ResultadoIA = { ok: boolean; erro?: string; secoes?: SecaoIA[] };

// Gera rascunho com IA (não grava — devolve preview para revisão humana).
export async function gerarRascunhoIA(politicaId: string, tema: string): Promise<ResultadoIA> {
  const politica = await prisma.politica.findUnique({ where: { id: politicaId }, include: { area: true } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  const usuario = await getUsuarioAtual();
  if (!podeEditarConteudo(usuario, politica)) return { ok: false, erro: "Sem permissão para editar esta política." };

  const r = await gerarRascunhoNorma({
    tema,
    area: politica.area.nome,
    classificacao: rotuloClassificacao(politica.classificacao),
  });
  if (r.ok) await registrar("ia.gerar", "Politica", politicaId, tema.slice(0, 80));
  return r;
}

// Aplica o rascunho revisado às seções (grava). Só sobrescreve as seções presentes no draft.
export async function aplicarSecoesIA(politicaId: string, secoes: SecaoIA[]): Promise<{ ok: boolean; erro?: string }> {
  const politica = await prisma.politica.findUnique({ where: { id: politicaId }, include: { secoes: true } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  const usuario = await getUsuarioAtual();
  if (!podeEditarConteudo(usuario, politica)) return { ok: false, erro: "Sem permissão." };

  const porCodigo = new Map(politica.secoes.map((s) => [s.codigo, s]));
  for (const draft of secoes) {
    const alvo = porCodigo.get(String(draft.codigo));
    if (!alvo) continue;
    if (alvo.tipo === "tabela") {
      if (Array.isArray(draft.linhas)) {
        await prisma.secao.update({ where: { id: alvo.id }, data: { linhas: draft.linhas as never } });
      }
    } else if (typeof draft.corpo === "string") {
      await prisma.secao.update({ where: { id: alvo.id }, data: { corpo: draft.corpo } });
    }
  }
  await registrar("ia.aplicar", "Politica", politicaId, `${secoes.length} seções`);
  revalidatePath(`/catalogo/${politicaId}`);
  revalidatePath(`/catalogo/${politicaId}/editar`);
  return { ok: true };
}
