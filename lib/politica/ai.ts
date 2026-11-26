import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";

// Camada de IA do assistente de redação: SOMENTE Anthropic (Claude), pela API de
// Mensagens — decisão do usuário (26/11/2026). Mesma configuração do G-SST:
//   ANTHROPIC_API_KEY        chave da API (segredo do Container App; nunca no código)
//   ANTHROPIC_WORKSPACE_ID   opcional; exigido quando a chave não está presa a um workspace
//   ANTHROPIC_MODEL          modelo de redação (padrão: claude-sonnet-5-5)
//   ANTHROPIC_MODEL_RAPIDO   modelo das tarefas curtas (padrão: claude-haiku-5-5)
//   ANTHROPIC_ENDPOINT       padrão https://api.anthropic.com
// Sem chave, a geração fica indisponível (botão desabilitado).
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID ?? "";
const MODELO = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const MODELO_RAPIDO = process.env.ANTHROPIC_MODEL_RAPIDO ?? "claude-haiku-5-5";
const ENDPOINT = (process.env.ANTHROPIC_ENDPOINT ?? "https://api.anthropic.com").replace(/\/$/, "");

export const iaDisponivel = () => API_KEY.length > 0;

type Mensagem = { role: string; content: string };
type OpcoesChamada = { maxTokens?: number; rapido?: boolean };

/** Extrai o objeto JSON de uma resposta que pode vir com texto ou cercas de código ao redor. */
export function extrairJson(texto: string): string {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  return ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : "{}";
}

async function chamarIA(messages: Mensagem[], opcoes: OpcoesChamada = {}): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const conversa = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

  const r = await fetch(`${ENDPOINT}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      ...(WORKSPACE_ID ? { "anthropic-workspace-id": WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: opcoes.rapido ? MODELO_RAPIDO : MODELO,
      max_tokens: opcoes.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages: conversa,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha na IA (${r.status}): ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const blocos: { type: string; text?: string }[] = Array.isArray(data?.content) ? data.content : [];
  return blocos
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

export type SecaoIA = { codigo: string; corpo?: string; linhas?: string[][] };

// Gera rascunho das seções de Política no padrão do Manual do SGI (cap. 16.1 e 18)
// a partir de um tema.
export async function gerarRascunhoNorma(dados: {
  tema: string;
  area: string;
  classificacao: string;
}): Promise<{ ok: boolean; secoes?: SecaoIA[]; erro?: string }> {
  if (!iaDisponivel()) return { ok: false, erro: "IA não configurada (chave da Anthropic ausente)." };
  const tema = dados.tema.trim();
  if (tema.length < 5) return { ok: false, erro: "Descreva melhor o tema da norma." };

  const esboco = ESQUELETO_PADRAO.map(
    (s) => `${s.codigo} ${s.titulo} (${s.tipo})${s.colunas ? ` colunas: ${(s.colunas as string[]).join(" | ")}` : ""} — ${s.dica}`,
  ).join("\n");

  // Quantidade e códigos derivados do esqueleto, nunca fixos no texto: o prompt
  // já ficou dizendo "8 seções" depois de a estrutura passar a 7.
  const total = ESQUELETO_PADRAO.length;
  const codigos = ESQUELETO_PADRAO.map((s) => s.codigo);
  const diretrizes = ESQUELETO_PADRAO.find((s) => s.titulo === "Diretrizes");
  const umaTabela = ESQUELETO_PADRAO.find((s) => s.tipo === "tabela");

  const system = [
    "Você é redator normativo sênior da AAHBRANT Engenharia & Construções.",
    "Escreve políticas internas em português do Brasil, tom formal, institucional e objetivo.",
    `Segue EXATAMENTE a estrutura de ${total} seções abaixo. Seções tipo 'tabela' devem vir em 'linhas' (array de linhas; cada linha é um array de células na ordem das colunas). Seções tipo 'texto' vêm em 'corpo'.`,
    // Padrão de redação do Manual do SGI, capítulo 18.
    "REDAÇÃO: impessoal, voz ativa, sem ambiguidade. Use 'Deve', 'Compete', 'Cabe ao', 'É responsabilidade', 'Poderá'. NUNCA use 'Achamos', 'Entendemos', 'Pode ser', 'Talvez', 'Nós', 'Eu'.",
    "Ao citar norma externa, use a nomenclatura oficial com número e ano (ex.: ISO 9001:2015, ABNT NBR 14724:2023). Citação incompleta é proibida.",
    "Não crie siglas: elas dependem de cadastro prévio no Procedimento de Controle de Siglas do SGQ.",
    diretrizes
      ? `Na seção ${diretrizes.codigo} (${diretrizes.titulo}) use subtítulos numerados (${diretrizes.codigo}.1, ${diretrizes.codigo}.2…), no máximo até 4 níveis de numeração decimal.`
      : "",
    "Não invente dados específicos da empresa (nomes, valores, prazos) — use marcadores claros como [definir prazo] quando necessário.",
    "",
    "ESTRUTURA:",
    esboco,
  ]
    .filter(Boolean)
    .join("\n");

  const exemploTabela = umaTabela
    ? `,{"codigo":"${umaTabela.codigo}","linhas":[[${(umaTabela.colunas ?? []).map((c) => `"${c}"`).join(",")}]]}`
    : "";

  const user = [
    `Gere o rascunho completo da norma sobre: "${tema}".`,
    `Área/setor: ${dados.area}. Classificação: ${dados.classificacao}.`,
    `Responda SOMENTE em JSON no formato: {"secoes":[{"codigo":"1","corpo":"..."}${exemploTabela}, ...]} com os ${total} códigos (${codigos.join(", ")}).`,
  ].join("\n");

  try {
    const raw = await chamarIA(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { maxTokens: 8000 },
    );
    const parsed = JSON.parse(extrairJson(raw));
    const secoes: SecaoIA[] = Array.isArray(parsed?.secoes) ? parsed.secoes : [];
    if (!secoes.length) return { ok: false, erro: "A IA não retornou seções válidas." };
    return { ok: true, secoes };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro inesperado na IA." };
  }
}

export type SecaoSnapshot = { codigo: string; titulo: string; corpo?: string; linhas?: string[][] };

// Resumo de 1 frase do que mudou entre duas versões da política, pra
// alimentar a linha nova da tabela de Controle de Revisões (Manual, cap.
// 19). Best-effort: qualquer falha (IA indisponível, chamada falha,
// resposta vazia) retorna null — quem chama decide o texto de fallback,
// porque esta função não sabe o número da revisão em questão.
export async function gerarDescricaoRevisao(
  secoesAnteriores: SecaoSnapshot[],
  secoesAtuais: SecaoSnapshot[],
): Promise<string | null> {
  if (!iaDisponivel()) return null;

  const formatar = (secoes: SecaoSnapshot[]) =>
    secoes
      // Secao.corpo é `String @default("")` — nunca null/undefined, mesmo em
      // seção tipo tabela. Usa `||` (não `??`) pra cair no fallback de
      // `linhas` quando corpo vem como string vazia.
      .map((s) => `${s.codigo} ${s.titulo}: ${s.corpo || (s.linhas ?? []).map((l) => l.join(" | ")).join("; ")}`)
      .join("\n");

  const system = [
    "Você é redator normativo sênior da AAHBRANT Engenharia & Construções.",
    "Compare a versão ANTERIOR e a versão ATUAL de uma norma interna e descreva, em UMA frase curta e objetiva, o que mudou.",
    "Estilo dos exemplos do Manual de Padronização Documental: 'Inclusão do item 4.2', 'Revisão da seção de Responsabilidades'.",
    "Responda SOMENTE com a frase — sem aspas, sem pontuação final além de ponto, sem preâmbulo.",
  ].join("\n");

  const user = ["VERSÃO ANTERIOR:", formatar(secoesAnteriores), "", "VERSÃO ATUAL:", formatar(secoesAtuais)].join("\n");

  try {
    const texto = (
      await chamarIA(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { maxTokens: 300, rapido: true },
      )
    ).trim();
    return texto.length > 0 ? texto : null;
  } catch {
    return null;
  }
}
