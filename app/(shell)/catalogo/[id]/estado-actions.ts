"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

function temConteudo(secoes: { tipo: string; corpo: string; linhas: unknown }[]): boolean {
  return secoes.some((s) =>
    s.tipo === "tabela"
      ? Array.isArray(s.linhas) && (s.linhas as unknown[]).length > 0
      : s.corpo.trim().length > 0,
  );
}

// Publica: rascunho → publicada. Congela conteúdo (edição bloqueada) e carimba autor/data.
export async function publicarPolitica(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podePublicar(usuario)) return { ok: false, erro: "Sem permissão para publicar (apenas Diretoria/admin)." };

  const politica = await prisma.politica.findUnique({ where: { id }, include: { secoes: true } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (politica.estado !== "rascunho") return { ok: false, erro: "Só é possível publicar uma política em rascunho." };
  if (!temConteudo(politica.secoes)) {
    return { ok: false, erro: "Não é possível publicar sem conteúdo — preencha ao menos uma seção." };
  }

  // Snapshot do conteúdo no momento da publicação (texto oficial congelado).
  const snapshot = politica.secoes
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => ({
      codigo: s.codigo,
      titulo: s.titulo,
      tipo: s.tipo,
      corpo: s.corpo,
      colunas: (s.colunas as unknown) ?? null,
      linhas: (s.linhas as unknown) ?? null,
    }));

  await prisma.politica.update({
    where: { id },
    data: {
      estado: "publicada",
      publicadaEm: new Date(),
      publicadaPorNome: usuario!.nome,
      publicadaPorEmail: usuario!.email,
      conteudoPublicado: snapshot as never,
      revogadaEm: null,
    },
  });
  await registrar("politica.publicar", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}

// Revoga: publicada → revogada. Norma deixa de valer (histórico preservado).
export async function revogarPolitica(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podePublicar(usuario)) return { ok: false, erro: "Sem permissão para revogar (apenas Diretoria/admin)." };

  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (politica.estado !== "publicada") return { ok: false, erro: "Só é possível revogar uma política publicada." };

  await prisma.politica.update({
    where: { id },
    data: { estado: "revogada", revogadaEm: new Date() },
  });
  await registrar("politica.revogar", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}

// Reabre para revisão: publicada/revogada → rascunho (destrava edição para nova versão).
export async function reabrirPolitica(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podePublicar(usuario)) return { ok: false, erro: "Sem permissão para reabrir (apenas Diretoria/admin)." };

  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (politica.estado === "rascunho") return { ok: false, erro: "A política já está em rascunho." };

  await prisma.politica.update({
    where: { id },
    data: { estado: "rascunho" },
  });
  await registrar("politica.reabrir", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
