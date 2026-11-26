"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { gerarCodigoNormativo } from "@/lib/politica/codigo";
import { tipoDocumentoValido, tipoDocumento, artigoDocumento, type TipoDocumentoValor } from "@/lib/constants";
import { extrairComResumo, extrairDeTextoSimples, extensaoSuportada, type ResumoImportacao } from "@/lib/politica/importarDocumento";
import { salvarArquivo } from "@/lib/storage";
import { proximoNumeroVersao } from "@/lib/politica/dominio";

const CLASSIFICACOES_VALIDAS = ["publico_interno", "restrito", "confidencial"] as const;
const TAMANHO_MAXIMO_IMPORTACAO = 10 * 1024 * 1024; // 10 MB

export type ResultadoAcao = { ok: boolean; erro?: string };
export type ResultadoImportacao = ResultadoAcao & { id?: string; resumo?: ResumoImportacao };

export async function criarPolitica(formData: FormData): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podeCriarPolitica(usuario)) {
    return { ok: false, erro: "Sem permissão para criar política (apenas SGI/admin)." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const classificacao = String(formData.get("classificacao") ?? "").trim();
  const consorcioIdBruto = String(formData.get("consorcioId") ?? "").trim();
  const consorcioId = consorcioIdBruto || undefined;
  // v3: sem campo "tipo" no form (ex.: o de /catalogo), assume Política — é o
  // comportamento de sempre, preservado.
  const tipoBruto = String(formData.get("tipo") ?? "politica").trim();
  const tipo: TipoDocumentoValor = tipoDocumentoValido(tipoBruto) ? tipoBruto : "politica";

  const infoTipo = tipoDocumento(tipo);
  const { artigo } = artigoDocumento(infoTipo);
  if (!titulo) return { ok: false, erro: `Informe o título d${artigo} ${infoTipo.rotulo.toLowerCase()}.` };
  if (!area) return { ok: false, erro: "Informe a área responsável." };
  if (!CLASSIFICACOES_VALIDAS.includes(classificacao as never)) {
    return { ok: false, erro: "Classificação inválida." };
  }

  try {
    const areaRegistro = await prisma.area.upsert({
      where: { nome: area },
      update: {},
      create: { nome: area },
    });

    const codigo = await gerarCodigoNormativo(areaRegistro.id, areaRegistro.nome, tipo);

    // Nasce com o esqueleto de Política do Manual do SGI (cap. 16.1) — hoje o
    // mesmo esqueleto vale para todos os tipos (decisão do usuário, 2026-07-28);
    // esqueleto próprio por tipo (Procedimento tem Fluxograma/Registros no
    // Manual, cap. 16.2) fica para quando for necessário, tipo por tipo.
    const nova = await prisma.politica.create({
      data: {
        titulo,
        codigo,
        tipo,
        areaId: areaRegistro.id,
        consorcioId,
        classificacao: classificacao as never,
        secoes: {
          create: ESQUELETO_PADRAO.map((s) => ({
            ordem: s.ordem,
            codigo: s.codigo,
            titulo: s.titulo,
            tipo: s.tipo,
            colunas: s.colunas ?? undefined,
            linhas: s.tipo === "tabela" ? [] : undefined,
          })),
        },
      },
    });
    await registrar("politica.criar", "Politica", nova.id, `${titulo} (${area})`);
  } catch (e: unknown) {
    // Violação de unicidade (título+área) ou outro erro do banco
    const msg =
      e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
        ? "Já existe um documento com esse título nessa área."
        : "Falha ao salvar. Verifique a conexão com o banco.";
    return { ok: false, erro: msg };
  }

  revalidatePath("/catalogo");
  revalidatePath(`/tipos/${tipo}`);
  revalidatePath("/");
  return { ok: true };
}

// Sprint 1 (upload e transformação): cria uma política nova a partir de um
// arquivo (.docx/.pdf/.txt/.md) OU de texto colado direto no campo — extrai
// o conteúdo e monta uma Secao por capítulo detectado (ver
// lib/politica/importarDocumento.ts). Mesma validação de
// título/área/classificação de criarPolitica; não reaproveita o
// ESQUELETO_PADRAO nem qualquer código presente no arquivo/texto original —
// o código é sempre gerado por gerarCodigoNormativo, como em criarPolitica.
export async function importarDocumento(formData: FormData): Promise<ResultadoImportacao> {
  const usuario = await getUsuarioAtual();
  if (!podeCriarPolitica(usuario)) {
    return { ok: false, erro: "Sem permissão para criar política (apenas SGI/admin)." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const classificacao = String(formData.get("classificacao") ?? "").trim();
  const tipoBruto = String(formData.get("tipo") ?? "politica").trim();
  const tipo: TipoDocumentoValor = tipoDocumentoValido(tipoBruto) ? tipoBruto : "politica";
  const arquivo = formData.get("arquivo");
  const textoColado = String(formData.get("texto") ?? "").trim();

  const infoTipo = tipoDocumento(tipo);
  const { artigo } = artigoDocumento(infoTipo);
  if (!titulo) return { ok: false, erro: `Informe o título d${artigo} ${infoTipo.rotulo.toLowerCase()}.` };
  if (!area) return { ok: false, erro: "Informe a área responsável." };
  if (!CLASSIFICACOES_VALIDAS.includes(classificacao as never)) {
    return { ok: false, erro: "Classificação inválida." };
  }

  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  if (!temArquivo && !textoColado) {
    return { ok: false, erro: "Selecione um arquivo ou cole o texto pra importar." };
  }

  let secoesImportadas;
  let origem: string;
  let resumo: ResumoImportacao | undefined;
  let original: { nome: string; tipo: string; bytes: Buffer } | undefined;
  try {
    if (temArquivo) {
      const arq = arquivo as File;
      if (!extensaoSuportada(arq.name)) {
        return { ok: false, erro: "Formato não suportado. Use .docx, .pdf, .txt ou .md." };
      }
      if (arq.size > TAMANHO_MAXIMO_IMPORTACAO) {
        return { ok: false, erro: "Arquivo maior que 10 MB." };
      }
      const bytes = Buffer.from(await arq.arrayBuffer());
      const extraido = await extrairComResumo(bytes, arq.name);
      secoesImportadas = extraido.secoes;
      resumo = extraido.resumo;
      original = { nome: arq.name, tipo: arq.type || arq.name.split(".").pop() || "arquivo", bytes };
      origem = `arquivo ${arq.name}`;
    } else {
      secoesImportadas = extrairDeTextoSimples(textoColado);
      if (secoesImportadas.length === 0) throw new Error("Não foi possível extrair conteúdo do texto colado.");
      origem = "texto colado";
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao ler o conteúdo." };
  }

  try {
    const areaRegistro = await prisma.area.upsert({
      where: { nome: area },
      update: {},
      create: { nome: area },
    });

    const codigo = await gerarCodigoNormativo(areaRegistro.id, areaRegistro.nome, tipo);

    const nova = await prisma.politica.create({
      data: {
        titulo,
        codigo,
        tipo,
        areaId: areaRegistro.id,
        classificacao: classificacao as never,
        secoes: {
          create: secoesImportadas.map((s, i) => ({
            ordem: i + 1,
            codigo: s.codigo ?? String(i + 1),
            titulo: s.titulo,
            tipo: s.tipo ?? "texto",
            corpo: s.corpo,
            ...(s.tipo === "tabela" ? { colunas: s.colunas ?? [], linhas: s.linhas ?? [] } : {}),
          })),
        },
      },
    });
    // O arquivo original fica anexado ao documento (como versão do tipo "importado"),
    // para consulta e conferência. Falha aqui não desfaz a importação do texto.
    if (original) {
      try {
        const salvo = await salvarArquivo(nova.id, original.nome, original.bytes);
        await prisma.versao.create({
          data: {
            politicaId: nova.id,
            numero: proximoNumeroVersao(0),
            estado: "ativa",
            documento: {
              create: { nome: original.nome, tipo: original.tipo, tamanho: salvo.tamanho, hash: salvo.hash, estado: "importado", oficial: false },
            },
          },
        });
      } catch {
        resumo?.avisos.push("O texto foi importado, mas o arquivo original não pôde ser anexado (talvez já exista outro idêntico).");
      }
    }
    await registrar("politica.criar", "Politica", nova.id, `${titulo} (${area}) — importado de ${origem}`);
    revalidatePath("/catalogo");
    revalidatePath(`/tipos/${tipo}`);
    revalidatePath("/");
    return { ok: true, id: nova.id, resumo };
  } catch (e: unknown) {
    const msg =
      e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
        ? "Já existe um documento com esse título nessa área."
        : "Falha ao salvar. Verifique a conexão com o banco.";
    return { ok: false, erro: msg };
  }
}
