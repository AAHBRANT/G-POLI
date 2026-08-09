"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { podeComentarSecao, podeResolverComentario } from "@/lib/auth/rbac";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

// Sprint 3: comentário de revisão por parágrafo (estilo Word). Ver comentário
// no schema.prisma (model Comentario) sobre a estratégia de ancoragem —
// paragrafoIndex + trechoAncora, nunca invalida/perde um comentário existente
// mesmo que o texto mude depois.
async function carregarSecaoComPolitica(secaoId: string) {
  return prisma.secao.findUnique({
    where: { id: secaoId },
    include: { politica: true },
  });
}

// Cria um comentário raiz num parágrafo específico da seção.
export async function criarComentario(
  secaoId: string,
  dados: { paragrafoIndex: number; trechoAncora: string; texto: string },
): Promise<ResultadoAcao> {
  const secao = await carregarSecaoComPolitica(secaoId);
  if (!secao) return { ok: false, erro: "Seção não encontrada." };
  const usuario = await getUsuarioAtual();
  if (!podeComentarSecao(usuario, secao.politica)) {
    return { ok: false, erro: "Sem permissão para comentar esta seção." };
  }
  const texto = dados.texto.trim();
  if (!texto) return { ok: false, erro: "Comentário vazio." };

  await prisma.comentario.create({
    data: {
      secaoId,
      paragrafoIndex: dados.paragrafoIndex,
      trechoAncora: dados.trechoAncora,
      texto,
      autorNome: usuario!.nome,
      autorEmail: usuario!.email,
    },
  });

  await registrar("comentario.criar", "Secao", secaoId, `${secao.codigo} · parágrafo ${dados.paragrafoIndex}`);
  revalidatePath(`/catalogo/${secao.politicaId}`);
  revalidatePath(`/catalogo/${secao.politicaId}/editar`);
  return { ok: true };
}

// Responde a um comentário existente (thread) — herda seção/parágrafo do pai.
export async function responderComentario(comentarioId: string, texto: string): Promise<ResultadoAcao> {
  const pai = await prisma.comentario.findUnique({
    where: { id: comentarioId },
    include: { secao: { include: { politica: true } } },
  });
  if (!pai) return { ok: false, erro: "Comentário não encontrado." };
  const usuario = await getUsuarioAtual();
  if (!podeComentarSecao(usuario, pai.secao.politica)) {
    return { ok: false, erro: "Sem permissão para comentar esta seção." };
  }
  const t = texto.trim();
  if (!t) return { ok: false, erro: "Resposta vazia." };

  await prisma.comentario.create({
    data: {
      secaoId: pai.secaoId,
      paragrafoIndex: pai.paragrafoIndex,
      trechoAncora: pai.trechoAncora,
      texto: t,
      autorNome: usuario!.nome,
      autorEmail: usuario!.email,
      respostaDeId: pai.respostaDeId ?? pai.id, // sempre aninha no comentário raiz, nunca em outra resposta
    },
  });

  await registrar("comentario.responder", "Secao", pai.secaoId, `resposta a ${pai.id}`);
  revalidatePath(`/catalogo/${pai.secao.politicaId}`);
  revalidatePath(`/catalogo/${pai.secao.politicaId}/editar`);
  return { ok: true };
}

// Marca um comentário raiz (e sua thread) como resolvido/reaberto.
export async function alternarResolvidoComentario(
  comentarioId: string,
  resolvido: boolean,
): Promise<ResultadoAcao> {
  const comentario = await prisma.comentario.findUnique({
    where: { id: comentarioId },
    include: { secao: { include: { politica: true } } },
  });
  if (!comentario) return { ok: false, erro: "Comentário não encontrado." };
  const usuario = await getUsuarioAtual();
  if (!podeResolverComentario(usuario, comentario.secao.politica, comentario)) {
    return { ok: false, erro: "Sem permissão para resolver este comentário." };
  }

  await prisma.comentario.update({
    where: { id: comentarioId },
    data: resolvido
      ? { resolvido: true, resolvidoPorNome: usuario!.nome, resolvidoEm: new Date() }
      : { resolvido: false, resolvidoPorNome: null, resolvidoEm: null },
  });

  await registrar(
    resolvido ? "comentario.resolver" : "comentario.reabrir",
    "Secao",
    comentario.secaoId,
    comentario.id,
  );
  revalidatePath(`/catalogo/${comentario.secao.politicaId}`);
  revalidatePath(`/catalogo/${comentario.secao.politicaId}/editar`);
  return { ok: true };
}

// Lista as threads de comentário (só raízes com respostas aninhadas) de uma seção.
export async function listarComentarios(secaoId: string) {
  return prisma.comentario.findMany({
    where: { secaoId, respostaDeId: null },
    include: { respostas: { orderBy: { criadoEm: "asc" } } },
    orderBy: { criadoEm: "asc" },
  });
}
