"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
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
  await prisma.pendencia.updateMany({
    where: { politicaId, estado: "pendente" },
    data: { estado: "cancelada" },
  });
  const linhas = dadosPendencia(politicaId, tipo, publicadaEm, alvos);
  if (linhas.length > 0) {
    // dadosPendencia (Task 2) tipa `tipo` como `string` (função pura, genérica);
    // aqui o valor real sempre vem de politica.tipo (enum TipoDocumento) — cast
    // localizado no limite com o Prisma Client, não no dado em si.
    await prisma.pendencia.createMany({ data: linhas as Prisma.PendenciaCreateManyInput[], skipDuplicates: true });
  }
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
  await prisma.pendencia.updateMany({
    where: { politicaId: id, estado: "pendente" },
    data: { estado: "cancelada" },
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
