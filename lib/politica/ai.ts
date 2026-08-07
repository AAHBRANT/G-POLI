import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";

// Camada de IA (Azure OpenAI). Plugável por env; se não configurada, generation fica indisponível.
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
const KEY = process.env.AZURE_OPENAI_KEY ?? "";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt5mini";
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview";

export const iaDisponivel = () => ENDPOINT.length > 0 && KEY.length > 0;

export type SecaoIA = { codigo: string; corpo?: string; linhas?: string[][] };

// Gera rascunho das seções de Política no padrão do Manual do SGI (cap. 16.1 e 18)
// a partir de um tema.
export async function gerarRascunhoNorma(dados: {
  tema: string;
  area: string;
  classificacao: string;
}): Promise<{ ok: boolean; secoes?: SecaoIA[]; erro?: string }> {
  if (!iaDisponivel()) return { ok: false, erro: "IA não configurada (Azure OpenAI ausente)." };
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
    const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": KEY },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // gpt-5 (reasoning): usa max_completion_tokens e temperatura padrão.
        max_completion_tokens: 6000,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `Falha na IA (${r.status}): ${t.slice(0, 200)}` };
    }
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
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
      .map((s) => `${s.codigo} ${s.titulo}: ${s.corpo ?? (s.linhas ?? []).map((l) => l.join(" | ")).join("; ")}`)
      .join("\n");

  const system = [
    "Você é redator normativo sênior da AAHBRANT Engenharia & Construções.",
    "Compare a versão ANTERIOR e a versão ATUAL de uma norma interna e descreva, em UMA frase curta e objetiva, o que mudou.",
    "Estilo dos exemplos do Manual de Padronização Documental: 'Inclusão do item 4.2', 'Revisão da seção de Responsabilidades'.",
    "Responda SOMENTE com a frase — sem aspas, sem pontuação final além de ponto, sem preâmbulo.",
  ].join("\n");

  const user = ["VERSÃO ANTERIOR:", formatar(secoesAnteriores), "", "VERSÃO ATUAL:", formatar(secoesAtuais)].join("\n");

  try {
    const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": KEY },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: 100,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const texto = (data?.choices?.[0]?.message?.content ?? "").trim();
    return texto.length > 0 ? texto : null;
  } catch {
    return null;
  }
}
