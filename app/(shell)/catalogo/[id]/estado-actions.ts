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
import {
  transicao,
  temConteudo,
  montarSnapshot,
  corpoParaTexto,
  proximoNumeroVersao,
  audienciaVazia,
  unirAudiencia,
  type Estado,
  type UsuarioAlvo,
} from "@/lib/politica/dominio";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import { dadosPendencia } from "@/lib/politica/pendencia";
import { gerarDescricaoRevisao } from "@/lib/politica/ai";
import type { Prisma } from "@prisma/client";

export type ResultadoAcao = { ok: boolean; erro?: string };

function paraAlvo(u: { id: string; oid: string | null; nome: string; email: string }): UsuarioAlvo {
  return { id: u.id, oid: u.oid, nome: u.nome, email: u.email };
}

// Resolve o público-alvo de uma política: setores/usuários explícitos, ou
// "todos os colaboradores ativos" quando a audiência não foi restringida.
// Reaproveitada tanto pela notificação do Teams quanto pela criação de
// Pendencia — evita duas queries idênticas e duas cópias da lógica
// audienciaVazia/unirAudiencia.
async function resolverAudiencia(politicaId: string): Promise<UsuarioAlvo[]> {
  const politica = await prisma.politica.findUnique({
    where: { id: politicaId },
    include: {
      audienciaSetores: { include: { membros: { where: { ativo: true } } } },
      audienciaUsuarios: { where: { ativo: true } },
    },
  });
  if (!politica) return [];

  // Consórcio como destino substitui o público-alvo por setor/usuário — ver
  // spec docs/superpowers/specs/2026-08-02-consorcios-design.md.
  if (politica.consorcioId) {
    const consorcio = await prisma.consorcio.findUnique({
      where: { id: politica.consorcioId },
      include: { membros: { where: { ativo: true } } },
    });
    return (consorcio?.membros ?? []).map(paraAlvo);
  }

  const setorIds = politica.audienciaSetores.map((a) => a.id);
  const usuarioIds = politica.audienciaUsuarios.map((u) => u.id);

  return audienciaVazia(setorIds, usuarioIds)
    ? (await prisma.usuario.findMany({ where: { ativo: true } })).map(paraAlvo)
    : unirAudiencia(
        politica.audienciaSetores.flatMap((a) => a.membros).map(paraAlvo),
        politica.audienciaUsuarios.map(paraAlvo),
      );
}

// Dispara a notificação do Teams para cada alvo da audiência já resolvida.
// Roda DEPOIS da publicação já confirmada no banco: falha de notificação
// (Graph fora do ar, usuário sem oid, etc.) nunca desfaz nem impede a
// publicação — só fica registrada em Notificacao para auditoria e para o
// relatório do gestor.
async function notificarAudiencia(politicaId: string, tituloPolitica: string, alvos: UsuarioAlvo[]): Promise<void> {
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

// Best-effort (nunca fail-closed): falha aqui NUNCA desfaz a publicação
// já commitada — mesma filosofia de notificarAudiencia. Cancela qualquer
// pendência ainda "pendente" da MESMA política (versão anterior) antes de
// criar a nova, pra nunca contar duas pendências da mesma norma pro mesmo
// usuário.
async function criarPendencias(politicaId: string, tipo: string, publicadaEm: Date, alvos: UsuarioAlvo[]): Promise<void> {
  const linhas = dadosPendencia(politicaId, tipo, publicadaEm, alvos);
  // Sem linhas pra criar (ex.: resolverAudiencia falhou e caiu no fallback
  // fail-open []) não cancela o que já existe — perderia silenciosamente a
  // obrigação de leitura em aberto. Não mexe em nada e sai.
  if (linhas.length === 0) return;
  // Cancelamento das pendencias antigas e criação das novas precisam ser
  // atômicos: nunca deixar a política sem NENHUMA pendência pendente entre
  // as duas operações.
  await prisma.$transaction([
    prisma.pendencia.updateMany({
      where: { politicaId, estado: "pendente" },
      data: { estado: "cancelada" },
    }),
    // dadosPendencia (Task 2) tipa `tipo` como `string` (função pura, genérica);
    // aqui o valor real sempre vem de politica.tipo (enum TipoDocumento) — cast
    // localizado no limite com o Prisma Client, não no dado em si.
    prisma.pendencia.createMany({ data: linhas as Prisma.PendenciaCreateManyInput[], skipDuplicates: true }),
  ]);
}

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

  const politica = await prisma.politica.findUnique({
    where: { id },
    include: { secoes: true, area: true },
  });
  if (!politica) return { ok: false, erro: "Política não encontrada." };

  const t = transicao(politica.estado as Estado, "publicar");
  if (!t.ok) return { ok: false, erro: t.erro };
  if (!temConteudo(politica.secoes)) {
    return { ok: false, erro: "Não é possível publicar sem conteúdo — preencha ao menos uma seção." };
  }

  const snapshot = montarSnapshot(politica.secoes);
  const novaRevisao = politica.publicadaEm ? politica.revisao + 1 : politica.revisao;
  const agora = new Date();

  // Controle de Revisões (Manual, cap. 19): busca as versões anteriores
  // ANTES de gerar o .docx, pra montar a lista completa (antigas + a nova)
  // e imprimir tudo de uma vez — nunca depois, senão o documento gerado
  // divergiria do que fica persistido.
  // documento: { oficial: true } — mesmo predicado do updateMany abaixo (linha
  // ~221): anexo manual (adicionarVersao, Task 5) cria Versao com
  // documento.oficial: false e NUNCA deve entrar no Controle de Revisões.
  const versoesAnteriores = await prisma.versao.findMany({
    where: { politicaId: id, documento: { oficial: true } },
    orderBy: { numero: "asc" },
    select: { revisaoNaEpoca: true, criadaEm: true, descricaoAlteracao: true, responsavelNome: true },
  });
  // Dado legado: política publicada antes desta funcionalidade existir tem
  // publicadaEm preenchido mas NENHUMA Versao — sintetiza a linha "00" a
  // partir do que Politica ainda guarda, mesmo princípio já usado acima pra
  // Versao antiga sem os campos novos (nunca inventar dado, "—" pro que não
  // se sabe). Sem isso a tabela de uma republicação começaria em "01".
  const linhasAnteriores =
    versoesAnteriores.length === 0 && politica.publicadaEm
      ? [
          {
            revisao: "—",
            data: politica.publicadaEm.toLocaleDateString("pt-BR"),
            descricao: "—",
            responsavel: politica.publicadaPorNome ?? "—",
          },
        ]
      : versoesAnteriores.map((v) => ({
          revisao: v.revisaoNaEpoca != null ? String(v.revisaoNaEpoca).padStart(2, "0") : "—",
          data: v.criadaEm.toLocaleDateString("pt-BR"),
          descricao: v.descricaoAlteracao ?? "—",
          responsavel: v.responsavelNome ?? "—",
        }));

  let descricaoNovaVersao: string;
  if (!politica.publicadaEm) {
    descricaoNovaVersao = "Emissão inicial do documento";
  } else {
    const secoesAtuais = snapshot.map((s) => ({ codigo: s.codigo, titulo: s.titulo, corpo: corpoParaTexto(s) }));
    const secoesAnteriores = Array.isArray(politica.conteudoPublicado)
      ? (politica.conteudoPublicado as Array<{ codigo: string; titulo: string; corpo?: string; linhas?: string[][] }>)
      : [];
    const descricaoIA = await gerarDescricaoRevisao(secoesAnteriores, secoesAtuais);
    descricaoNovaVersao = descricaoIA ?? `Republicação — revisão ${String(novaRevisao).padStart(2, "0")}`;
  }

  const controleRevisoes = [
    ...linhasAnteriores,
    {
      revisao: String(novaRevisao).padStart(2, "0"),
      data: agora.toLocaleDateString("pt-BR"),
      descricao: descricaoNovaVersao,
      responsavel: usuario!.nome,
    },
  ];

  // Fail-closed (ver docs/DEPLOY.md e a spec desta feature): sem o
  // documento oficial gerado, a política NÃO fica publicada.
  let docxBuffer: Buffer;
  try {
    docxBuffer = await gerarDocumentoOficial({
      titulo: politica.titulo,
      codigo: politica.codigo,
      publicadaEm: agora,
      areaNome: politica.area.nome,
      revisao: novaRevisao,
      controleRevisoes,
      secoes: snapshot.map((s) => ({ codigo: s.codigo, titulo: s.titulo, corpo: corpoParaTexto(s) })),
    });
  } catch (erro) {
    console.error("Falha ao gerar o documento oficial (.docx) — publicação bloqueada:", erro);
    return {
      ok: false,
      erro: "Falha ao gerar o documento oficial (.docx). Publicação cancelada — avise o suporte.",
    };
  }

  const nomeArquivo = `${politica.codigo ?? politica.titulo}.docx`;

  try {
    const salvo = await salvarArquivo(id, nomeArquivo, docxBuffer);

    await prisma.$transaction(async (tx) => {
      // Só a cadeia de documentos OFICIAIS tem substituição — anexo manual
      // nunca entra aqui (ver adicionarVersao, Task 5).
      await tx.versao.updateMany({
        where: { politicaId: id, estado: "ativa", documento: { oficial: true } },
        data: { estado: "substituida" },
      });
      const totais = await tx.versao.count({ where: { politicaId: id } });
      await tx.versao.create({
        data: {
          politicaId: id,
          numero: proximoNumeroVersao(totais),
          estado: "ativa",
          conteudoSnapshot: snapshot as never,
          revisaoNaEpoca: novaRevisao,
          descricaoAlteracao: descricaoNovaVersao,
          responsavelNome: usuario!.nome,
          documento: {
            create: {
              nome: nomeArquivo,
              tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              tamanho: salvo.tamanho,
              hash: salvo.hash,
              estado: "importado",
              oficial: true,
            },
          },
        },
      });
      await tx.politica.update({
        where: { id },
        data: {
          estado: t.estado,
          publicadaEm: agora,
          publicadaPorNome: usuario!.nome,
          publicadaPorEmail: usuario!.email,
          conteudoPublicado: snapshot as never,
          revogadaEm: null,
          revisao: novaRevisao,
        },
      });
    });
  } catch (erro) {
    console.error("Falha ao salvar o documento oficial — publicação cancelada:", erro);
    return { ok: false, erro: "Falha ao salvar o documento oficial. Publicação cancelada — tente novamente." };
  }

  await registrar("politica.publicar", "Politica", id, politica.titulo);

  // Fail-open (mesma filosofia de antes desta task, quando essa query vivia
  // dentro de notificarAudiencia): um hiccup transitório de banco aqui nunca
  // pode deixar os revalidatePath abaixo de fora — a publicação já está
  // commitada. Fallback [] só deixa de criar pendência/notificar desta vez.
  let alvos: UsuarioAlvo[] = [];
  try {
    alvos = await resolverAudiencia(id);
  } catch (erro) {
    console.error("Falha ao resolver audiencia (publicação já confirmada):", erro);
  }

  // Nunca deixar a criação de pendência ou a notificação falharem a
  // publicação: ela já está confirmada.
  try {
    await criarPendencias(id, politica.tipo, agora, alvos);
  } catch (erro) {
    console.error("Falha ao criar pendencias de ciencia (publicação já confirmada):", erro);
  }
  try {
    await notificarAudiencia(id, politica.titulo, alvos);
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
