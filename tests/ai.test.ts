import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SECOES_ANTES = [{ codigo: "4", titulo: "Diretrizes", corpo: "Texto antigo." }];
const SECOES_DEPOIS = [{ codigo: "4", titulo: "Diretrizes", corpo: "Texto novo, com mais detalhe." }];

describe("gerarDescricaoRevisao", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("IA não configurada (sem endpoint/key): retorna null sem chamar fetch", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "");
    vi.stubEnv("AZURE_OPENAI_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IA disponível e responde com texto: retorna o texto (trim aplicado)", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  Revisão do item 4.  " } }] }),
    }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBe("Revisão do item 4.");
  });

  it("fetch rejeita (erro de rede): retorna null", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
  });

  it("resposta HTTP não-ok: retorna null", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "erro" }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
  });

  it("resposta vazia/só espaço: retorna null", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "   " } }] }),
    }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
  });

  // Finding 2 (revisão final): Secao.corpo é `String @default("")` — nunca
  // null/undefined mesmo em seção tipo tabela. Com `??` isso não caía no
  // fallback de `linhas`, e a IA via a seção como vazia.
  it("seção tipo tabela (corpo vazio, linhas preenchidas): envia as linhas formatadas à IA, não texto vazio", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Atualização da tabela." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const secaoTabela = [{ codigo: "19", titulo: "Controle de Revisões", corpo: "", linhas: [["a", "b"]] }];
    const resultado = await gerarDescricaoRevisao(secaoTabela, secaoTabela);

    expect(resultado).toBe("Atualização da tabela.");
    const corpoRequisicao = JSON.parse(fetchMock.mock.calls[0][1].body);
    const mensagemUsuario = corpoRequisicao.messages.find((m: { role: string }) => m.role === "user").content;
    expect(mensagemUsuario).toContain("a | b");
    expect(mensagemUsuario).not.toMatch(/Controle de Revisões:\s*(\n|$)/);
  });
});
