import { prisma } from "@/lib/prisma";
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
import { gerarPdfOficial } from "@/lib/politica/gerarPdf";
import { dadosPendencia } from "@/lib/politica/pendencia";
import { gerarDescricaoRevisao } from "@/lib/politica/ai";
import { calcularProximaRevisao } from "@/lib/politica/revisao";
import { reindexarPolitica } from "@/lib/politica/indiceServidor";
import type { Prisma } from "@prisma/client";

// Núcleo da publicação. NÃO é uma Server Action (não vai em arquivo "use server"):
// quem chama já verificou a permissão. A action publicarPolitica checa
// podePublicar(usuário da sessão) e chama executarPublicacao.

export type ResultadoPublicacao = { ok: boolean; erro?: string };

function paraAlvo(u: { id: string; oid: string | null; nome: string; email: string }): UsuarioAlvo {
  return { id: u.id, oid: u.oid, nome: u.nome, email: u.email };
}

// Resolve o público-alvo de uma política: quem vai receber o aviso do Teams e a
// Pendencia de ciência. Depende da CLASSIFICAÇÃO (ver regraAudiencia em
// lib/politica/dominio.ts) e é sempre FILTRADO por podeVerDocumento — ninguém é
// avisado de um documento que não consegue abrir. Reaproveitada tanto pela
// notificação do Teams quanto pela criação de Pendencia.
async function resolverAudiencia(politicaId: string): Promise<UsuarioAlvo[]> {
  const politica = await prisma.politica.findUnique({
    where: { id: politicaId },
    include: {
      audienciaSetores: { select: { id: true } },
      audienciaUsuarios: { select: { id: true } },
    },
  });
  if (!politica) return [];

  const setorIds = politica.audienciaSetores.map((a) => a.id);
  const usuarioIds = politica.audienciaUsuarios.map((u) => u.id);
  const vinculos = { setores: { select: { id: true } }, consorcios: { select: { id: true } } };

  let candidatos;
  if (politica.consorcioId) {
    // Consórcio como destino: os vinculados ao consórcio (ver spec
    // docs/superpowers/specs/2026-08-02-consorcios-design.md) — e, se o
    // documento for restrito/confidencial, só os que também podem vê-lo.
    candidatos = await prisma.usuario.findMany({
      where: { ativo: true, consorcios: { some: { id: politica.consorcioId } } },
      include: vinculos,
    });
  } else {
    const regra = regraAudiencia(politica.classificacao, setorIds, usuarioIds);
    if (regra.todos) {
      candidatos = await prisma.usuario.findMany({ where: { ativo: true }, include: vinculos });
    } else {
      const quem: Prisma.UsuarioWhereInput[] = [];
      if (regra.setoresDoPublicoAlvo && setorIds.length) quem.push({ setores: { some: { id: { in: setorIds } } } });
      if (regra.setorDono) quem.push({ setores: { some: { id: politica.areaId } } });
      if (regra.nominais && usuarioIds.length) quem.push({ id: { in: usuarioIds } });
      candidatos = quem.length
        ? await prisma.usuario.findMany({ where: { ativo: true, OR: quem }, include: vinculos })
        : [];
    }
  }

  const doc = {
    estado: "publicada",
    classificacao: politica.classificacao as Classificacao,
    areaId: politica.areaId,
    consorcioId: politica.consorcioId,
    audienciaSetorIds: setorIds,
    audienciaUsuarioIds: usuarioIds,
  };
  const veem = candidatos.filter((c) =>
    podeVerDocumento(
      {
        id: c.id,
        oid: c.oid ?? "",
        nome: c.nome,
        email: c.email,
        perfil: c.perfil as Perfil,
        setores: c.setores.map((x) => x.id),
        consorcios: c.consorcios.map((x) => x.id),
      },
      doc,
    ),
  );
  return unirAudiencia(veem.map(paraAlvo), []);
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

// Publica: rascunho → publicada. Congela conteúdo (edição bloqueada) e carimba autor/data.
export async function executarPublicacao(
  id: string,
  usuario: { nome: string; email: string },
): Promise<ResultadoPublicacao> {
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
    where: { politicaId: id, documento: { oficial: true, NOT: { tipo: "application/pdf" } } },
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
      responsavel: usuario.nome,
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
  const nomeBase = politica.codigo ?? politica.titulo;

  // PDF oficial (mesmo conteúdo congelado, com tabelas de verdade): best-effort.
  // O .docx é o documento oficial que a publicação exige (fail-closed acima); o PDF
  // serve para visualizar no app sem baixar. Falha aqui não cancela a publicação.
  let pdfGerado: { nome: string; tamanho: number; hash: string } | null = null;
  try {
    const pdfBuffer = await gerarPdfOficial({
      titulo: politica.titulo,
      codigo: politica.codigo,
      publicadaEm: agora,
      areaNome: politica.area.nome,
      revisao: novaRevisao,
      controleRevisoes,
      secoes: snapshot.map((s) => ({
        codigo: s.codigo,
        titulo: s.titulo,
        corpo: s.corpo,
        tipo: s.tipo,
        colunas: s.colunas as string[] | null,
        linhas: s.linhas as string[][] | null,
      })),
    });
    const salvoPdf = await salvarArquivo(id, `${nomeBase}.pdf`, pdfBuffer);
    pdfGerado = { nome: `${nomeBase}.pdf`, tamanho: salvoPdf.tamanho, hash: salvoPdf.hash };
  } catch (erro) {
    console.error("Falha ao gerar o PDF oficial (publicação segue só com o .docx):", erro);
  }

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
          responsavelNome: usuario.nome,
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
      if (pdfGerado) {
        await tx.versao.create({
          data: {
            politicaId: id,
            numero: proximoNumeroVersao(totais + 1),
            estado: "ativa",
            conteudoSnapshot: snapshot as never,
            revisaoNaEpoca: novaRevisao,
            descricaoAlteracao: descricaoNovaVersao,
            responsavelNome: usuario.nome,
            documento: {
              create: {
                nome: pdfGerado.nome,
                tipo: "application/pdf",
                tamanho: pdfGerado.tamanho,
                hash: pdfGerado.hash,
                estado: "importado",
                oficial: true,
              },
            },
          },
        });
      }
      await tx.politica.update({
        where: { id },
        data: {
          estado: t.estado,
          publicadaEm: agora,
          publicadaPorNome: usuario.nome,
          publicadaPorEmail: usuario.email,
          conteudoPublicado: snapshot as never,
          revogadaEm: null,
          revisao: novaRevisao,
          // Etapa 2: prazo de revisão — próxima revisão = publicação + periodicidade.
          proximaRevisaoEm: calcularProximaRevisao(agora, politica.periodicidadeRevisaoMeses),
        },
      });
    });
  } catch (erro) {
    console.error("Falha ao salvar o documento oficial — publicação cancelada:", erro);
    return { ok: false, erro: "Falha ao salvar o documento oficial. Publicação cancelada — tente novamente." };
  }

  // Índice por seção (etapa 2b): best-effort — a publicação já foi confirmada e
  // uma falha aqui nunca a desfaz (o admin pode reconstruir em /api/admin/reindexar).
  try {
    await reindexarPolitica(id);
  } catch (erro) {
    console.error("Falha ao indexar o texto oficial (publicação já confirmada):", erro);
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
  return { ok: true };
}
