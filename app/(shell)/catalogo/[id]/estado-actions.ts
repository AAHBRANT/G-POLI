"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  getUsuarioAtual,
  podePublicar,
  podeEnviarParaAprovacao,
  podeAprovarGestor,
  podeAprovarDiretoria,
  podeRetirarDaAprovacao,
} from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { podeVerDocumento, type Classificacao, type Perfil } from "@/lib/auth/rbac";
import {
  transicao,
  temConteudo,
  montarSnapshot,
  corpoParaTexto,
  proximoNumeroVersao,
  regraAudiencia,
  unirAudiencia,
  type Estado,
  type UsuarioAlvo,
} from "@/lib/politica/dominio";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import { dadosPendencia } from "@/lib/politica/pendencia";
import { gerarDescricaoRevisao } from "@/lib/politica/ai";
import { calcularProximaRevisao } from "@/lib/politica/revisao";
import { removerIndice } from "@/lib/politica/indiceServidor";
import { executarPublicacao } from "@/lib/politica/publicar";
import type { Prisma } from "@prisma/client";

export type ResultadoAcao = { ok: boolean; erro?: string };

// ---------------------------------------------------------------------------
// Sprint 4/5/6: fluxo de aprovação Gestor → Diretoria (modelo B)
// ---------------------------------------------------------------------------

// Envia para aprovação: rascunho → em_aprovacao_gestor. Conteúdo já fica
// congelado a partir daqui (podeEditarConteudo exige estado === rascunho).
export async function enviarParaAprovacao(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (!podeEnviarParaAprovacao(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para enviar esta política para aprovação." };
  }

  const t = transicao(politica.estado as Estado, "enviar_aprovacao");
  if (!t.ok) return { ok: false, erro: t.erro };
  if (!temConteudo(await prisma.secao.findMany({ where: { politicaId: id } }))) {
    return { ok: false, erro: "Não é possível enviar para aprovação sem conteúdo — preencha ao menos uma seção." };
  }

  await prisma.politica.update({
    where: { id },
    data: {
      estado: t.estado,
      enviadaAprovacaoEm: new Date(),
      enviadaAprovacaoPorNome: usuario!.nome,
      enviadaAprovacaoPorEmail: usuario!.email,
      // Novo ciclo de revisão — limpa o resultado da última rejeição/aprovação
      // do Gestor (histórico permanente continua na Auditoria).
      aprovadaGestorEm: null,
      aprovadaGestorPorNome: null,
      aprovadaGestorPorEmail: null,
      rejeitadaEm: null,
      rejeitadaPorNome: null,
      rejeitadaPorEmail: null,
      rejeitadaNaEtapa: null,
      motivoRejeicao: null,
    },
  });
  await registrar("politica.enviar_aprovacao", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/publicacao");
  return { ok: true };
}

// Gestor aprova: em_aprovacao_gestor → em_aprovacao_diretoria (Sprint 6 — a
// entrada na fila da Diretoria é automática, não é uma ação separada).
export async function aprovarGestor(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (!podeAprovarGestor(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para aprovar (apenas o Gestor do setor dono, ou admin)." };
  }

  const t = transicao(politica.estado as Estado, "aprovar_gestor");
  if (!t.ok) return { ok: false, erro: t.erro };

  await prisma.politica.update({
    where: { id },
    data: {
      estado: t.estado,
      aprovadaGestorEm: new Date(),
      aprovadaGestorPorNome: usuario!.nome,
      aprovadaGestorPorEmail: usuario!.email,
    },
  });
  await registrar("politica.aprovar_gestor", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/publicacao");
  return { ok: true };
}

// Gestor rejeita: em_aprovacao_gestor → rascunho, com motivo obrigatório.
export async function rejeitarGestor(id: string, motivo: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (!podeAprovarGestor(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para rejeitar (apenas o Gestor do setor dono, ou admin)." };
  }
  const m = motivo.trim();
  if (!m) return { ok: false, erro: "Informe o motivo da rejeição." };

  const t = transicao(politica.estado as Estado, "rejeitar_gestor");
  if (!t.ok) return { ok: false, erro: t.erro };

  await prisma.politica.update({
    where: { id },
    data: {
      estado: t.estado,
      rejeitadaEm: new Date(),
      rejeitadaPorNome: usuario!.nome,
      rejeitadaPorEmail: usuario!.email,
      rejeitadaNaEtapa: "gestor",
      motivoRejeicao: m,
    },
  });
  await registrar("politica.rejeitar_gestor", "Politica", id, `${politica.titulo} — ${m}`);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/publicacao");
  return { ok: true };
}

// Diretoria rejeita: em_aprovacao_diretoria → rascunho, com motivo obrigatório.
// (Diretoria APROVAR é a própria publicarPolitica abaixo — reaproveita 100%
// da geração de .docx/versão/notificação já existente do modelo A.)
export async function rejeitarDiretoria(id: string, motivo: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podeAprovarDiretoria(usuario)) {
    return { ok: false, erro: "Sem permissão para rejeitar (apenas Diretoria/admin)." };
  }
  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  const m = motivo.trim();
  if (!m) return { ok: false, erro: "Informe o motivo da rejeição." };

  const t = transicao(politica.estado as Estado, "rejeitar_diretoria");
  if (!t.ok) return { ok: false, erro: t.erro };

  await prisma.politica.update({
    where: { id },
    data: {
      estado: t.estado,
      rejeitadaEm: new Date(),
      rejeitadaPorNome: usuario!.nome,
      rejeitadaPorEmail: usuario!.email,
      rejeitadaNaEtapa: "diretoria",
      motivoRejeicao: m,
    },
  });
  await registrar("politica.rejeitar_diretoria", "Politica", id, `${politica.titulo} — ${m}`);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/publicacao");
  return { ok: true };
}

// Retira da aprovação: quem enviaria também pode "puxar de volta" pra ajustar
// algo antes de seguir — sem precisar de motivo (não é rejeição de terceiro).
export async function retirarDaAprovacao(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (!podeRetirarDaAprovacao(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para retirar esta política da aprovação." };
  }

  const t = transicao(politica.estado as Estado, "retirar_aprovacao");
  if (!t.ok) return { ok: false, erro: t.erro };

  await prisma.politica.update({ where: { id }, data: { estado: t.estado } });
  await registrar("politica.retirar_aprovacao", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/publicacao");
  return { ok: true };
}

// Publica: rascunho → publicada. Congela conteúdo (edição bloqueada) e carimba autor/data.
export async function publicarPolitica(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podePublicar(usuario)) return { ok: false, erro: "Sem permissão para publicar (apenas Diretoria/admin)." };

  const r = await executarPublicacao(id, { nome: usuario!.nome, email: usuario!.email });
  if (!r.ok) return r;

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
  // Best-effort (mesma filosofia de publicarPolitica): a revogação da política
  // acima já foi commitada — falha aqui nunca pode desfazê-la.
  try {
    await prisma.pendencia.updateMany({
      where: { politicaId: id, estado: "pendente" },
      data: { estado: "cancelada" },
    });
  } catch (erro) {
    console.error("Falha ao cancelar pendencias de ciencia (revogação já confirmada):", erro);
  }
  try {
    await removerIndice(id); // revogado deixa de ser consultável
  } catch (erro) {
    console.error("Falha ao remover o índice do documento revogado (revogação já confirmada):", erro);
  }
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
  try {
    await removerIndice(id); // em edição, o texto não é mais o oficial vigente
  } catch (erro) {
    console.error("Falha ao remover o índice do documento reaberto (reabertura já confirmada):", erro);
  }
  await registrar("politica.reabrir", "Politica", id, politica.titulo);
  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
