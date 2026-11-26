import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SECOES_ANTES = [{ codigo: "4", titulo: "Diretrizes", corpo: "Texto antigo." }];
const SECOES_DEPOIS = [{ codigo: "4", titulo: "Diretrizes", corpo: "Texto novo, com mais detalhe." }];

// Resposta no formato da API de Mensagens da Anthropic.
const resposta = (texto: string) => ({ ok: true, json: async () => ({ content: [{ type: "text", text: texto }] }) });

function limpar() {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_WORKSPACE_ID", "");
}

describe("gerarDescricaoRevisao (Claude)", () => {
  beforeEach(limpar);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("IA não configurada (sem chave): retorna null sem chamar fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao, iaDisponivel } = await import("@/lib/politica/ai");

    expect(iaDisponivel()).toBe(false);
    expect(await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IA disponível e responde com texto: retorna o texto (trim aplicado)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-teste");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("  Revisão do item 4.  ")));
    const { gerarDescricaoRevisao, iaDisponivel } = await import("@/lib/politica/ai");

    expect(iaDisponivel()).toBe(true);
    expect(await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS)).toBe("Revisão do item 4.");
  });

  it("fetch rejeita (erro de rede): retorna null", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-teste");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");
    expect(await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS)).toBeNull();
  });

  it("resposta HTTP não-ok: retorna null", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-teste");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "erro" }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");
    expect(await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS)).toBeNull();
  });

  it("resposta vazia/só espaço: retorna null", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-teste");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("   ")));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");
    expect(await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS)).toBeNull();
  });

  // Secao.corpo é `String @default("")` — nunca null/undefined mesmo em seção tipo
  // tabela. Com `??` isso não caía no fallback de `linhas`, e a IA via a seção vazia.
  it("seção tipo tabela (corpo vazio, linhas preenchidas): envia as linhas formatadas à IA", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-teste");
    const fetchMock = vi.fn().mockResolvedValue(resposta("Atualização da tabela."));
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const secaoTabela = [{ codigo: "19", titulo: "Controle de Revisões", corpo: "", linhas: [["a", "b"]] }];
    expect(await gerarDescricaoRevisao(secaoTabela, secaoTabela)).toBe("Atualização da tabela.");
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo.messages[0].content).toContain("a | b");
  });
});

describe("chamada à API da Anthropic", () => {
  beforeEach(limpar);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("endereço, cabeçalhos e corpo: x-api-key, versão, modelo rápido, system separado", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-teste");
    const fetchMock = vi.fn().mockResolvedValue(resposta("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");
    await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("chave-teste");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.headers["anthropic-workspace-id"]).toBeUndefined();
    expect(init.headers.Authorization).toBeUndefined();
    const corpo = JSON.parse(init.body);
    expect(corpo.model).toBe("claude-haiku-5-5"); // tarefa curta → modelo rápido
    expect(corpo.max_tokens).toBeGreaterThan(0);
    expect(corpo.system).toContain("redator normativo");
    expect(corpo.messages.every((m: { role: string }) => m.role === "user")).toBe(true);
  });

  it("envia o workspace quando configurado e respeita endpoint e modelos por variável", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_WORKSPACE_ID", "wrkspc_123");
    vi.stubEnv("ANTHROPIC_ENDPOINT", "https://proxy.interno/");
    vi.stubEnv("ANTHROPIC_MODEL_RAPIDO", "modelo-x");
    const fetchMock = vi.fn().mockResolvedValue(resposta("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");
    await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.interno/v1/messages");
    expect(init.headers["anthropic-workspace-id"]).toBe("wrkspc_123");
    expect(JSON.parse(init.body).model).toBe("modelo-x");
  });

  it("junta só os blocos de texto da resposta", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: "thinking", thinking: "…" }, { type: "text", text: "Parte 1. " }, { type: "text", text: "Parte 2." }] }),
      }),
    );
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");
    expect(await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS)).toBe("Parte 1. Parte 2.");
  });
});

describe("gerarRascunhoNorma (Claude)", () => {
  beforeEach(limpar);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const dados = { tema: "Controle de documentos", area: "Qualidade", classificacao: "Público interno" };

  it("sem chave: indisponível e sem chamada de rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { gerarRascunhoNorma } = await import("@/lib/politica/ai");
    const r = await gerarRascunhoNorma(dados);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("Anthropic");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devolve as seções mesmo quando o Claude cerca o JSON com texto/cerca de código", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const json = JSON.stringify({ secoes: [{ codigo: "1", corpo: "Objetivo." }] });
    const fetchMock = vi.fn().mockResolvedValue(resposta("Aqui está o rascunho:\n```json\n" + json + "\n```"));
    vi.stubGlobal("fetch", fetchMock);
    const { gerarRascunhoNorma } = await import("@/lib/politica/ai");

    const r = await gerarRascunhoNorma(dados);
    expect(r.ok).toBe(true);
    expect(r.secoes?.[0]).toMatchObject({ codigo: "1", corpo: "Objetivo." });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("claude-sonnet-5-5"); // redação → modelo principal
  });

  it("resposta sem seções válidas", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("não consegui")));
    const { gerarRascunhoNorma } = await import("@/lib/politica/ai");
    expect((await gerarRascunhoNorma(dados)).ok).toBe(false);
  });

  it("erro da API vira mensagem útil, sem vazar a chave", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chave-secreta-123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate_limit_error" }));
    const { gerarRascunhoNorma } = await import("@/lib/politica/ai");
    const r = await gerarRascunhoNorma(dados);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("429");
    expect(r.erro).not.toContain("chave-secreta-123");
  });

  it("tema curto demais é recusado antes de chamar a IA", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { gerarRascunhoNorma } = await import("@/lib/politica/ai");
    expect((await gerarRascunhoNorma({ ...dados, tema: "ab" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extrairJson", () => {
  it("pega o objeto entre a primeira { e a última }", async () => {
    const { extrairJson } = await import("@/lib/politica/ai");
    expect(extrairJson('texto {"a":1} fim')).toBe('{"a":1}');
    expect(extrairJson('```json\n{"a":{"b":2}}\n```')).toBe('{"a":{"b":2}}');
    expect(extrairJson("sem json")).toBe("{}");
  });
});
