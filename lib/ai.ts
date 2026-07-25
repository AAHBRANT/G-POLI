import { ESQUELETO_PADRAO } from "@/lib/esqueleto";

// Camada de IA (Azure OpenAI). Plugável por env; se não configurada, generation fica indisponível.
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
const KEY = process.env.AZURE_OPENAI_KEY ?? "";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt5mini";
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview";

export const iaDisponivel = () => ENDPOINT.length > 0 && KEY.length > 0;

export type SecaoIA = { codigo: string; corpo?: string; linhas?: string[][] };

// Gera rascunho das 8 seções no padrão AAHBRANT a partir de um tema.
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

  const system = [
    "Você é redator normativo sênior da AAHBRANT Engenharia & Construções.",
    "Escreve políticas internas em português do Brasil, tom formal, institucional e objetivo.",
    "Segue EXATAMENTE a estrutura de 8 seções abaixo. Seções tipo 'tabela' devem vir em 'linhas' (array de linhas; cada linha é um array de células na ordem das colunas). Seções tipo 'texto' vêm em 'corpo'.",
    "Nas Diretrizes Gerais use subtítulos numerados (6.1, 6.2…). Não invente dados específicos da empresa (nomes, valores, prazos) — use marcadores claros como [definir prazo] quando necessário.",
    "",
    "ESTRUTURA:",
    esboco,
  ].join("\n");

  const user = [
    `Gere o rascunho completo da norma sobre: "${tema}".`,
    `Área/setor: ${dados.area}. Classificação: ${dados.classificacao}.`,
    'Responda SOMENTE em JSON no formato: {"secoes":[{"codigo":"1","corpo":"..."},{"codigo":"4","linhas":[["Termo","Definição"]]}, ...]} com os 8 códigos (1..8).',
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
