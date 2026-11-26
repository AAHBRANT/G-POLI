import { corpoParaTexto } from "@/lib/politica/dominio";

// Regras PURAS do índice por seção (sem banco): normalização do texto, divisão em
// trechos e montagem da consulta. O acesso ao banco fica em indiceServidor.ts.

/** Minúsculas, sem acento e com espaços colapsados — usado no índice e na consulta. */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type SecaoSnapshot = {
  codigo: string;
  titulo: string;
  tipo: string;
  corpo: string;
  colunas?: unknown;
  linhas?: unknown;
};

export type TrechoNovo = {
  ordem: number;
  secaoCodigo: string;
  secaoTitulo: string;
  parte: number;
  texto: string;
  textoBusca: string;
};

export const TAMANHO_MAXIMO_TRECHO = 1200;

// Quebra um parágrafo maior que o limite em pedaços, preferindo o fim de frase
// e, na falta, um espaço.
function quebrarParagrafoLongo(par: string, max: number): string[] {
  const partes: string[] = [];
  let resto = par.trim();
  while (resto.length > max) {
    let corte = resto.lastIndexOf(". ", max);
    if (corte < max * 0.4) corte = resto.lastIndexOf(" ", max);
    if (corte <= 0) corte = max;
    partes.push(resto.slice(0, corte + 1).trim());
    resto = resto.slice(corte + 1).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

/**
 * Divide o snapshot (texto oficial congelado) em trechos de até `max` caracteres,
 * por seção, respeitando parágrafos. O título da seção entra no texto de busca,
 * para a seção ser achada pelo nome dela.
 */
export function dividirEmTrechos(secoes: SecaoSnapshot[], max = TAMANHO_MAXIMO_TRECHO): TrechoNovo[] {
  const trechos: TrechoNovo[] = [];
  let ordem = 0;
  for (const s of secoes) {
    const texto = corpoParaTexto(s).trim();
    if (!texto) continue;

    const blocos: string[] = [];
    let atual = "";
    for (const par of texto.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
      for (const pedaco of par.length > max ? quebrarParagrafoLongo(par, max) : [par]) {
        if (atual && atual.length + pedaco.length + 1 > max) {
          blocos.push(atual);
          atual = pedaco;
        } else {
          atual = atual ? `${atual}\n${pedaco}` : pedaco;
        }
      }
    }
    if (atual) blocos.push(atual);

    blocos.forEach((bloco, i) => {
      ordem += 1;
      trechos.push({
        ordem,
        secaoCodigo: s.codigo,
        secaoTitulo: s.titulo,
        parte: i + 1,
        texto: bloco,
        textoBusca: normalizarParaBusca(`${s.titulo} ${bloco}`),
      });
    });
  }
  return trechos;
}

export type ModoBusca = "todas" | "qualquer";

const MAX_PALAVRAS = 12;

/**
 * Transforma a pergunta numa consulta para websearch_to_tsquery: palavras sem
 * acento. "qualquer" (OU) serve a perguntas em linguagem natural; "todas" (E)
 * a buscas por termos. Sem palavras úteis, devolve null.
 */
export function consultaParaBusca(consulta: string, modo: ModoBusca = "qualquer"): string | null {
  const palavras = [...new Set(normalizarParaBusca(consulta).match(/[a-z0-9]{2,}/g) ?? [])]
    .filter((p) => p !== "or" && p !== "and")
    .slice(0, MAX_PALAVRAS);
  if (palavras.length === 0) return null;
  return palavras.join(modo === "qualquer" ? " or " : " ");
}
