"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import {
  transicao,
  temConteudo,
  montarSnapshot,
  audienciaVazia,
  unirAudiencia,
  type Estado,
  type UsuarioAlvo,
} from "@/lib/politica/dominio";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";

export type ResultadoAcao = { ok: boolean; erro?: string };

function paraAlvo(u: { id: string; oid: string | null; nome: string; email: string }): UsuarioAlvo {
  return { id: u.id, oid: u.oid, nome: u.nome, email: u.email };
}

// Resolve o público-alvo e dispara a notificação do Teams para cada um. Roda
// DEPOIS da publicação já confirmada no banco: falha de notificação (Graph fora
// do ar, usuário sem oid, etc.) nunca desfaz nem impede a publicação — só fica
// registrada em Notificacao para auditoria e para o relatório do gestor.
async function notificarAudiencia(politicaId: string, tituloPolitica: string): Promise<void> {
  const politica = await prisma.politica.findUnique({
    where: { id: politicaId },
    include: {
      audienciaSetores: { include: { membros: { where: { ativo: true } } } },
      audienciaUsuarios: { where: { ativo: true } },
    },
  });
  if (!politica) return;

  const setorIds = politica.audienciaSetores.map((a) => a.id);
  const usuarioIds = politica.audienciaUsuarios.map((u) => u.id);

  const alvos: UsuarioAlvo[] = audienciaVazia(setorIds, usuarioIds)
    ? (await prisma.usuario.findMany({ where: { ativo: true } })).map(paraAlvo)
    : unirAudiencia(
        politica.audienciaSetores.flatMap((a) => a.membros).map(paraAlvo),
        politica.audienciaUsuarios.map(paraAlvo),
      );

  // Sequencial, não paralelo: a audiência de uma política é modesta (dezenas,
  // não milhares) e isso evita estourar limite de requisições do Graph. Se a
  // escala crescer, isso pede fila — não antes disso.
  for (const alvo of alvos) {
    if (!alvo.oid) {
      await prisma.notificacao.create({
        data: {
          politicaId,
          usuarioEmail: alvo.email,
          usuarioNome: alvo.nome,
          enviada: false,
          motivo: "sem_oid (nunca autenticou pelo Teams)",
        },
      });
      continue;
    }
    const resultado = await enviarNotificacaoPoliticaPublicada({
      oid: alvo.oid,
      tituloPolitica,
      politicaId,
    });
    await prisma.notificacao.create({
      data: {
        politicaId,
        usuarioEmail: alvo.email,
        usuarioNome: alvo.nome,
        enviada: resultado.ok,
        motivo: resultado.ok ? "" : resultado.motivo,
      },
    });
  }
}

// Publica: rascunho → publicada. Congela conteúdo (edição bloqueada) e carimba autor/data.
export async function publicarPolitica(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podePublicar(usuario)) return { ok: false, erro: "Sem permissão para publicar (apenas Diretoria/admin)." };

  const politica = await prisma.politica.findUnique({ where: { id }, include: { secoes: true } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };

  const t = transicao(politica.estado as Estado, "publicar");
  if (!t.ok) return { ok: false, erro: t.erro };
  if (!temConteudo(politica.secoes)) {
    return { ok: false, erro: "Não é possível publicar sem conteúdo — preencha ao menos uma seção." };
  }

  // Snapshot do conteúdo no momento da publicação (texto oficial congelado).
  const snapshot = montarSnapshot(politica.secoes);
  // Revisão do cabeçalho institucional (Manual SGI cap. 11): 0 na primeira
  // publicação; incrementa a cada republicação (só se já tinha sido publicada
  // antes — reabrir→editar→publicar de novo).
  const novaRevisao = politica.publicadaEm ? politica.revisao + 1 : politica.revisao;

  await prisma.politica.update({
    where: { id },
    data: {
      estado: t.estado,
      publicadaEm: new Date(),
      publicadaPorNome: usuario!.nome,
      publicadaPorEmail: usuario!.email,
      conteudoPublicado: snapshot as never,
      revogadaEm: null,
      revisao: novaRevisao,
    },
  });
  await registrar("politica.publicar", "Politica", id, politica.titulo);

  // Nunca deixar a notificação falhar a publicação: ela já está confirmada.
  try {
    await notificarAudiencia(id, politica.titulo);
  } catch (erro) {
    console.error("Notificação de publicação falhou (publicação já confirmada):", erro);
  }

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

  const t = transicao(politica.estado as Estado, "revogar");
  if (!t.ok) return { ok: false, erro: t.erro };

  await prisma.politica.update({
    where: { id },
    data: { estado: t.estado, revogadaEm: new Date() },
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

  const t = transicao(politica.estado as Estado, "reabrir");
  if (!t.ok) return { ok: false, erro: t.erro };

  await prisma.politica.update({
    where: { id },
    data: { estado: t.estado },
  });
  await registrar("politica.reabrir", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
