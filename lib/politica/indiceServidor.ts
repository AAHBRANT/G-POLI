import { prisma } from "@/lib/prisma";
import { filtroVisibilidade, type UsuarioAtual } from "@/lib/auth/rbac";
import {
  consultaParaBusca,
  dividirEmTrechos,
  type ModoBusca,
  type SecaoSnapshot,
} from "@/lib/politica/indice";

// Índice por seção: acesso ao banco. Só documentos PUBLICADOS têm trechos, e o
// texto vem do snapshot congelado (conteudoPublicado) — nunca do rascunho.

/** (Re)cria os trechos de um documento. Se não está publicado, apenas limpa. Devolve quantos trechos ficaram. */
export async function reindexarPolitica(politicaId: string): Promise<number> {
  const politica = await prisma.politica.findUnique({
    where: { id: politicaId },
    select: { id: true, estado: true, revisao: true, conteudoPublicado: true },
  });
  if (!politica) return 0;

  if (politica.estado !== "publicada" || !Array.isArray(politica.conteudoPublicado)) {
    await prisma.trechoPolitica.deleteMany({ where: { politicaId } });
    return 0;
  }

  const trechos = dividirEmTrechos(politica.conteudoPublicado as unknown as SecaoSnapshot[]);
  await prisma.$transaction([
    prisma.trechoPolitica.deleteMany({ where: { politicaId } }),
    prisma.trechoPolitica.createMany({
      data: trechos.map((t) => ({ ...t, politicaId, revisao: politica.revisao })),
    }),
  ]);
  return trechos.length;
}

/** Remove o índice de um documento (revogado ou reaberto para edição). */
export async function removerIndice(politicaId: string): Promise<void> {
  await prisma.trechoPolitica.deleteMany({ where: { politicaId } });
}

/** Reconstrói o índice de todos os documentos publicados (após importação ou migração). */
export async function reindexarTodos(): Promise<{ politicas: number; trechos: number }> {
  const publicadas = await prisma.politica.findMany({ where: { estado: "publicada" }, select: { id: true } });
  let trechos = 0;
  for (const p of publicadas) trechos += await reindexarPolitica(p.id);
  // Quem deixou de estar publicado não pode ficar no índice.
  await prisma.trechoPolitica.deleteMany({ where: { politica: { estado: { not: "publicada" } } } });
  return { politicas: publicadas.length, trechos };
}

export type TrechoEncontrado = {
  trechoId: string;
  politicaId: string;
  codigo: string | null;
  titulo: string;
  tipo: string;
  revisao: number;
  area: string;
  secaoCodigo: string;
  secaoTitulo: string;
  texto: string;
  relevancia: number;
};

/**
 * Busca trechos pela pergunta, devolvendo SOMENTE o que `usuario` pode ver.
 * A relevância vem do banco (ts_rank); a permissão vem de filtroVisibilidade —
 * a mesma regra de todo o sistema —, aplicada ANTES de qualquer trecho sair
 * daqui. É a ferramenta de consulta do agente de IA.
 */
export async function buscarTrechos(
  usuario: UsuarioAtual | null,
  consulta: string,
  opcoes: { limite?: number; modo?: ModoBusca; candidatos?: number } = {},
): Promise<TrechoEncontrado[]> {
  const { limite = 6, modo = "qualquer", candidatos = 80 } = opcoes;
  const q = consultaParaBusca(consulta, modo);
  if (!q || !usuario) return [];

  const achados = await prisma.$queryRaw<{ id: string; rank: number }[]>`
    SELECT t.id, ts_rank(t.busca, websearch_to_tsquery('portuguese', ${q})) AS rank
    FROM "TrechoPolitica" t
    WHERE t.busca @@ websearch_to_tsquery('portuguese', ${q})
    ORDER BY rank DESC, t."ordem" ASC
    LIMIT ${candidatos}
  `;
  if (achados.length === 0) return [];

  const rank = new Map(achados.map((a) => [a.id, Number(a.rank)]));
  const linhas = await prisma.trechoPolitica.findMany({
    where: {
      id: { in: achados.map((a) => a.id) },
      politica: { estado: "publicada", AND: [filtroVisibilidade(usuario)] },
    },
    include: { politica: { select: { codigo: true, titulo: true, tipo: true, area: { select: { nome: true } } } } },
  });

  return linhas
    .map((t) => ({
      trechoId: t.id,
      politicaId: t.politicaId,
      codigo: t.politica.codigo,
      titulo: t.politica.titulo,
      tipo: t.politica.tipo,
      revisao: t.revisao,
      area: t.politica.area.nome,
      secaoCodigo: t.secaoCodigo,
      secaoTitulo: t.secaoTitulo,
      texto: t.texto,
      relevancia: rank.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.relevancia - a.relevancia)
    .slice(0, limite);
}

/**
 * Ids dos documentos cujo texto oficial combina com a busca (para ampliar a busca
 * da biblioteca com formas derivadas: "codificação" acha "codificar"). O resultado
 * ainda passa por filtroVisibilidade na consulta da biblioteca.
 */
export async function idsPorBuscaTexto(consulta: string, modo: ModoBusca = "todas"): Promise<string[]> {
  const q = consultaParaBusca(consulta, modo);
  if (!q) return [];
  const linhas = await prisma.$queryRaw<{ politicaId: string }[]>`
    SELECT DISTINCT t."politicaId"
    FROM "TrechoPolitica" t
    WHERE t.busca @@ websearch_to_tsquery('portuguese', ${q})
    LIMIT 300
  `;
  return linhas.map((l) => l.politicaId);
}
