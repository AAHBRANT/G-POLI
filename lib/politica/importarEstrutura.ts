// Extração ESTRUTURADA de .docx para a importação: separa o documento pelos
// CAPÍTULOS NUMERADOS (ex.: "1 OBJETIVO", "2 CAMPO DE APLICAÇÃO") mesmo quando o
// Word não usa o estilo "Título 1", mantém as TABELAS como tabelas (colunas e
// linhas), ignora o cabeçalho do original (título + tabela de controle de
// revisões, que o sistema gera sozinho) e avisa o que não pôde ser importado.
// Funções PURAS (sem rede e sem banco): recebem o HTML que o mammoth gera.

export type SecaoEstruturada = {
  /** Numeração do original: 7 para o capítulo, 7.1, 7.2… para tabelas e continuações dele. */
  codigo?: string;
  titulo: string;
  corpo: string;
  tipo: "texto" | "tabela";
  colunas?: string[];
  linhas?: string[][];
};

export type ResultadoEstrutura = {
  secoes: SecaoEstruturada[];
  avisos: string[];
  capitulos: number;
  tabelas: number;
};

type Bloco =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "item"; texto: string }
  | { tipo: "tabela"; linhas: string[][] };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodificar(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

function limpar(fragmento: string): string {
  return decodificar(fragmento.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function lerTabela(html: string): string[][] {
  const linhas: string[][] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const celulas: string[] = [];
    for (const m of tr.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      celulas.push(limpar(m[3]));
      const span = /colspan="?(\d+)"?/i.exec(m[2]);
      for (let i = 1; i < Number(span?.[1] ?? 1); i++) celulas.push(""); // célula mesclada ocupa as colunas seguintes
    }
    if (celulas.length > 0) linhas.push(celulas);
  }
  const largura = Math.max(0, ...linhas.map((l) => l.length));
  return linhas.map((l) => [...l, ...Array(largura - l.length).fill("")]);
}

function tokenizar(html: string): { blocos: Bloco[]; imagens: number } {
  const blocos: Bloco[] = [];
  const re = /<table[\s\S]*?<\/table>|<h([1-6])[^>]*>[\s\S]*?<\/h\1>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>/gi;
  for (const m of html.matchAll(re)) {
    const bruto = m[0];
    if (/^<table/i.test(bruto)) {
      const linhas = lerTabela(bruto);
      if (linhas.length > 0) blocos.push({ tipo: "tabela", linhas });
    } else if (/^<h[1-6]/i.test(bruto)) {
      const texto = limpar(bruto);
      if (texto) blocos.push({ tipo: "titulo", nivel: Number(m[1]), texto });
    } else if (/^<li/i.test(bruto)) {
      const texto = limpar(bruto);
      if (texto) blocos.push({ tipo: "item", texto });
    } else {
      const texto = limpar(bruto);
      if (texto) blocos.push({ tipo: "paragrafo", texto });
    }
  }
  return { blocos, imagens: (html.match(/<img\b/gi) ?? []).length };
}

// "1 OBJETIVO", "2. CAMPO DE APLICAÇÃO", "10 - INDICADORES": número + título em maiúsculas.
const CAPITULO_RE = /^\s*(\d{1,2})\s*[.\-–)]?\s+(\S.{1,100})$/;

function paraCapitulo(texto: string): { numero: number; titulo: string } | null {
  const m = CAPITULO_RE.exec(texto);
  if (!m) return null;
  const titulo = m[2].trim();
  const letras = titulo.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 3 || titulo !== titulo.toUpperCase()) return null; // precisa estar em maiúsculas
  return { numero: Number(m[1]), titulo };
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "para", "por", "com", "a", "o", "ao", "à", "às", "ou"]);

/** "DEFINIÇÕES E SIGLAS" → "Definições e Siglas". */
export function tituloLegivel(maiusculo: string): string {
  return maiusculo
    .toLowerCase()
    .split(/(\s+)/)
    .map((parte, i) => {
      if (/^\s+$/.test(parte) || parte === "") return parte;
      if (i > 0 && MINUSCULAS.has(parte)) return parte;
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    })
    .join("");
}

const ehLegendaDeTabela = (t: string) => /^tabela\s+\d+/i.test(t.trim());
const ehFonte = (t: string) => /^fonte\s*:/i.test(t.trim());

/** Capítulos numerados crescentes (ignora candidatos fora de sequência). Vazio se forem menos de 3. */
function detectarCapitulos(blocos: Bloco[]): Map<number, { numero: number; titulo: string }> {
  const achados = new Map<number, { numero: number; titulo: string }>();
  let ultimo = 0;
  blocos.forEach((b, i) => {
    if (b.tipo === "tabela" || b.tipo === "item") return;
    // Título 1 do Word vale como capítulo (sem o número na frente, se tiver); senão, "N TÍTULO" em maiúsculas.
    const cap =
      b.tipo === "titulo" && b.nivel === 1 && !paraCapitulo(b.texto)
        ? { numero: ultimo + 1, titulo: b.texto.replace(/^\d{1,2}\s*[.\-–)]?\s+/, "") }
        : paraCapitulo(b.texto);
    if (cap && cap.numero > ultimo && cap.numero <= ultimo + 3) {
      achados.set(i, cap);
      ultimo = cap.numero;
    }
  });
  return achados.size >= 3 || blocos.some((b) => b.tipo === "titulo" && b.nivel === 1) ? achados : new Map();
}

export function extrairEstrutura(html: string): ResultadoEstrutura {
  const { blocos, imagens } = tokenizar(html);
  const capitulos = detectarCapitulos(blocos);
  const avisos: string[] = [];
  const secoes: SecaoEstruturada[] = [];
  let tabelas = 0;

  // ---- Cabeçalho do original (antes do 1º capítulo) ----
  const primeiro = capitulos.size > 0 ? Math.min(...capitulos.keys()) : 0;
  const cabecalho = blocos.slice(0, primeiro);
  const corpoBlocos = blocos.slice(primeiro);
  let apresentacao = "";
  if (cabecalho.length > 0) {
    let tituloVisto = false;
    for (let i = 0; i < cabecalho.length; i++) {
      const b = cabecalho[i];
      if (b.tipo === "tabela") continue; // tabela de controle de revisões do original
      if (!tituloVisto && b.tipo === "paragrafo" && b.texto === b.texto.toUpperCase()) {
        tituloVisto = true; // título do documento (já está no cadastro)
        continue;
      }
      if (b.tipo === "paragrafo" && (ehLegendaDeTabela(b.texto) || ehFonte(b.texto))) continue;
      if (b.tipo === "paragrafo" || b.tipo === "item") apresentacao += (apresentacao ? "\n" : "") + (b.tipo === "item" ? "- " : "") + b.texto;
    }
    if (cabecalho.some((b) => b.tipo === "tabela")) {
      avisos.push("O cabeçalho do original (título e tabela de controle de revisões) não foi importado: o sistema gera o controle de revisões na publicação.");
    }
    if (apresentacao.trim()) secoes.push({ codigo: "0", titulo: "Apresentação", corpo: apresentacao.trim(), tipo: "texto" });
  }

  // ---- Corpo: capítulos, texto e tabelas ----
  const indiceBase = primeiro;
  let capituloAtual = capitulos.size > 0 ? "" : "Conteúdo Importado";
  let numeroAtual = capitulos.size > 0 ? 0 : 1;
  let partesDoCapitulo = 0; // quantas seções de texto/tabela deste capítulo já saíram
  let texto: string[] = [];
  let legendaPendente: string | null = null;

  const tituloDaParte = (sufixo?: string) => {
    const base = capituloAtual;
    if (sufixo) return `${base} — ${sufixo}`;
    return partesDoCapitulo === 0 ? base : `${base} (continuação)`;
  };
  const codigoDaParte = () => (partesDoCapitulo === 0 ? String(numeroAtual) : `${numeroAtual}.${partesDoCapitulo}`);
  const descarregarTexto = () => {
    const corpo = texto.join("\n").trim();
    texto = [];
    if (!corpo || !capituloAtual) return;
    secoes.push({ codigo: codigoDaParte(), titulo: tituloDaParte(), corpo, tipo: "texto" });
    partesDoCapitulo += 1;
  };

  for (let i = 0; i < corpoBlocos.length; i++) {
    const b = corpoBlocos[i];
    const cap = capitulos.get(i + indiceBase);
    if (cap) {
      descarregarTexto();
      // só reescreve se veio TUDO em maiúsculas (não estraga siglas em títulos já bem escritos)
      capituloAtual = cap.titulo === cap.titulo.toUpperCase() ? tituloLegivel(cap.titulo) : cap.titulo;
      numeroAtual = cap.numero;
      partesDoCapitulo = 0;
      legendaPendente = null;
      continue;
    }

    if (b.tipo === "tabela") {
      const legenda = legendaPendente;
      legendaPendente = null;
      if (b.linhas.length < 2) {
        // 1 linha só: não é tabela de dados; entra como texto
        const linha = b.linhas[0].filter(Boolean).join(" | ");
        if (linha) texto.push(linha);
        continue;
      }
      // a legenda "Tabela N – ..." (já tirada do texto) dá nome à tabela
      descarregarTexto();
      let fonte = "";
      const prox = corpoBlocos[i + 1];
      if (prox && prox.tipo === "paragrafo" && ehFonte(prox.texto)) {
        fonte = prox.texto;
        i += 1; // consome a linha "Fonte: ..." junto da tabela
      }
      const nome = (legenda ?? "Tabela") + (fonte ? ` (${fonte})` : "");
      const [colunas, ...linhas] = b.linhas;
      secoes.push({ codigo: codigoDaParte(), titulo: tituloDaParte(nome), corpo: "", tipo: "tabela", colunas, linhas });
      partesDoCapitulo += 1;
      tabelas += 1;
      continue;
    }

    if (b.tipo === "paragrafo" && ehLegendaDeTabela(b.texto)) {
      // legenda: só vira nome da tabela se a PRÓXIMA coisa for uma tabela
      const prox = corpoBlocos[i + 1];
      if (prox && prox.tipo === "tabela" && prox.linhas.length >= 2) {
        legendaPendente = b.texto;
        continue;
      }
    }

    if (!capituloAtual) continue; // texto solto antes de qualquer capítulo, já tratado como cabeçalho
    if (b.tipo === "item") texto.push(`- ${b.texto}`);
    else texto.push(b.texto);
  }
  descarregarTexto();

  if (imagens > 0) {
    avisos.push(`${imagens} imagem${imagens > 1 ? "ns" : ""} do original (por exemplo, fluxograma) não ${imagens > 1 ? "foram importadas" : "foi importada"}: o arquivo original fica anexado ao documento.`);
  }
  return { secoes, avisos, capitulos: capitulos.size, tabelas };
}


/** Capítulos "N TÍTULO" em linhas de texto (PDF, .txt): números crescentes, ao menos 3. Chave = índice da linha. */
export function detectarCapitulosEmLinhas(linhas: string[]): Map<number, { numero: number; titulo: string }> {
  const achados = new Map<number, { numero: number; titulo: string }>();
  let ultimo = 0;
  linhas.forEach((linha, i) => {
    const cap = paraCapitulo(linha);
    if (cap && cap.numero > ultimo && cap.numero <= ultimo + 3) {
      achados.set(i, cap);
      ultimo = cap.numero;
    }
  });
  return achados.size >= 3 ? achados : new Map();
}
