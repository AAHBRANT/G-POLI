// Sprint 1: extrai texto de um arquivo (.docx/.pdf/.txt/.md) e o divide em
// seções pra alimentar a criação de um novo documento no editor. Cada função
// de extração devolve o mesmo formato — quem monta a Politica não precisa
// saber de onde o texto veio.

import { detectarCapitulosEmLinhas, extrairEstrutura, tituloLegivel } from "@/lib/politica/importarEstrutura";

export type SecaoImportada = {
  titulo: string;
  corpo: string;
  /** "tabela" quando a seção é uma tabela real (colunas + linhas); por padrão, texto. */
  tipo?: "texto" | "tabela";
  colunas?: string[];
  linhas?: string[][];
};

/** O que a importação encontrou, para mostrar à pessoa antes de ela revisar o rascunho. */
export type ResumoImportacao = { secoes: number; tabelas: number; avisos: string[] };

const TITULO_INEDITADO = "Conteúdo Importado";
const TITULO_MD_RE = /^(#{1,4})\s+(.+)$/;

function ehLinhaEmBranco(linha: string): boolean {
  return linha.trim().length === 0;
}

// Heurística pra .txt/.pdf (sem marcação de título nenhuma): uma linha curta,
// sem pontuação de fim de frase, isolada por linha em branco antes e depois
// (ou está na borda do documento), é tratada como título de seção. Best-effort
// — documentos sem esse padrão caem no fallback de "Conteúdo Importado" em
// agruparEmSecoes, nunca perdem texto.
function pareceTitulo(linha: string, linhaAnterior: string | undefined, proximaLinha: string | undefined): boolean {
  const texto = linha.trim();
  if (!texto || texto.length > 80) return false;
  if (/[.,;:]$/.test(texto)) return false;
  const anteriorEhBranco = linhaAnterior === undefined || ehLinhaEmBranco(linhaAnterior);
  const proximaEhBranco = proximaLinha === undefined || ehLinhaEmBranco(proximaLinha);
  return anteriorEhBranco && proximaEhBranco;
}

// Função pura central: agrupa uma sequência de parágrafos em seções.
// `nivel` é a hierarquia do título — 1 (capítulo) abre uma seção NOVA;
// 2+ (subcapítulo, ex. "7.1 Réplica do Modelo-Mestre") vira texto DENTRO
// da seção do capítulo atual, preservando a numeração decimal original —
// o Manual trata subcapítulo como texto numerado dentro do capítulo, não
// como item separado. `nivel: null` é corpo comum (não é título de nada).
//
// Texto antes do primeiro capítulo: se o documento TEM capítulo (nivel 1)
// em algum lugar, esse texto inicial é descartado — em documento formal já
// no padrão AAHBRANT (como os que a empresa já emite) é sempre o cabeçalho
// antigo do próprio arquivo (título, código, revisão, tabela de Controle
// de Revisões antiga), que o app já gera sozinho; reimportar isso como
// seção só duplicaria e carregaria o código antigo pro meio do texto. Se o
// documento NÃO tem nenhum capítulo (texto colado sem título nenhum), o
// texto inteiro vira uma seção "Conteúdo Importado" — nunca perde
// conteúdo nesse caso, que é o único jeito de saber se algo é "cabeçalho
// descartável" ou "o único conteúdo que existe".
export function agruparEmSecoes(paragrafos: { texto: string; nivel: number | null }[]): SecaoImportada[] {
  const temCapitulo = paragrafos.some((p) => p.nivel === 1);
  const secoes: SecaoImportada[] = [];
  let atual: SecaoImportada | null = null;
  for (const p of paragrafos) {
    if (!p.texto.trim()) continue;
    if (p.nivel === 1) {
      atual = { titulo: p.texto.trim(), corpo: "" };
      secoes.push(atual);
    } else if (atual) {
      atual.corpo = atual.corpo ? `${atual.corpo}\n${p.texto}` : p.texto;
    } else if (!temCapitulo) {
      atual = { titulo: TITULO_INEDITADO, corpo: p.texto };
      secoes.push(atual);
    }
  }
  // Um nível 1 detectado sem nenhum corpo depois (comum em rodapé de
  // página de PDF, ex. "-- 1 de 3 --") não vira seção vazia — descartado.
  // Não perde texto real: só acontece quando não havia corpo nenhum ali.
  return secoes.filter((s) => s.corpo.trim().length > 0);
}

export function extrairDeMarkdown(texto: string): SecaoImportada[] {
  const linhas = texto.split(/\r?\n/);
  const paragrafos = linhas.map((linha) => {
    const m = TITULO_MD_RE.exec(linha);
    return m ? { texto: m[2], nivel: m[1].length } : { texto: linha, nivel: null };
  });
  return agruparEmSecoes(paragrafos);
}

export function extrairDeTextoSimples(texto: string): SecaoImportada[] {
  const linhas = texto.split(/\r?\n/);
  // Capítulos numerados ("1 OBJETIVO", "2 CAMPO DE APLICAÇÃO"): com ao menos 3 em
  // sequência, eles mandam; senão vale a heurística de linha isolada e curta.
  const capitulos = detectarCapitulosEmLinhas(linhas.map((l) => l.trim()));
  const paragrafos = linhas.map((linha, i) => {
    const cap = capitulos.get(i);
    if (cap) return { texto: tituloLegivel(cap.titulo), nivel: 1 };
    return { texto: linha, nivel: capitulos.size > 0 ? null : pareceTitulo(linha, linhas[i - 1], linhas[i + 1]) ? 1 : null };
  });
  return agruparEmSecoes(paragrafos);
}

// mammoth.convertToHtml mapeia os estilos "Heading 1".."Heading 4" do Word
// pra <h1>..<h4>. Só heading 1 (capítulo) vira seção nova; heading 2-4
// (subcapítulo) vira texto dentro da seção do capítulo atual.
export function extrairDeHtml(html: string): SecaoImportada[] {
  const blocos = html.split(/<\/(?:h[1-4]|p|li)>/gi);
  const paragrafos: { texto: string; nivel: number | null }[] = [];
  for (const bloco of blocos) {
    const m = /<h([1-4])[^>]*>([\s\S]*)$/i.exec(bloco);
    const textoBruto = (m ? m[2] : bloco).replace(/<[^>]+>/g, "").trim();
    if (!textoBruto) continue;
    paragrafos.push({ texto: textoBruto, nivel: m ? Number(m[1]) : null });
  }
  return agruparEmSecoes(paragrafos);
}

const EXTENSOES_SUPORTADAS = ["docx", "pdf", "txt", "md"] as const;
export type ExtensaoSuportada = (typeof EXTENSOES_SUPORTADAS)[number];

export function extensaoSuportada(nomeArquivo: string): ExtensaoSuportada | null {
  const ext = nomeArquivo.split(".").pop()?.toLowerCase() ?? "";
  return (EXTENSOES_SUPORTADAS as readonly string[]).includes(ext) ? (ext as ExtensaoSuportada) : null;
}

// Ponto de entrada único: extrai e agrupa em seções, escolhendo o parser
// pela extensão. Lança se o formato não for suportado ou não houver
// conteúdo extraível — quem chama decide a mensagem de erro pro usuário.
export async function extrairSecoes(buffer: Buffer, nomeArquivo: string): Promise<SecaoImportada[]> {
  return (await extrairComResumo(buffer, nomeArquivo)).secoes;
}

// Igual a extrairSecoes, mas também devolve o resumo (seções, tabelas e avisos).
export async function extrairComResumo(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<{ secoes: SecaoImportada[]; resumo: ResumoImportacao }> {
  const ext = extensaoSuportada(nomeArquivo);
  if (!ext) throw new Error(`Formato não suportado: ${nomeArquivo}`);

  let secoes: SecaoImportada[];
  const avisos: string[] = [];
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const resultado = await mammoth.convertToHtml({ buffer });
    // Estruturado: capítulos numerados, tabelas reais, cabeçalho do original ignorado.
    const estrutura = extrairEstrutura(resultado.value);
    secoes = estrutura.secoes.length > 0 ? estrutura.secoes : extrairDeHtml(resultado.value);
    if (estrutura.secoes.length > 0) avisos.push(...estrutura.avisos);
  } else if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const resultado = await parser.getText();
      secoes = extrairDeTextoSimples(resultado.text);
    } finally {
      await parser.destroy();
    }
  } else if (ext === "md") {
    secoes = extrairDeMarkdown(buffer.toString("utf-8"));
  } else {
    secoes = extrairDeTextoSimples(buffer.toString("utf-8"));
  }

  if (secoes.length === 0) throw new Error("Não foi possível extrair conteúdo do arquivo.");
  return { secoes, resumo: { secoes: secoes.length, tabelas: secoes.filter((s) => s.tipo === "tabela").length, avisos } };
}
