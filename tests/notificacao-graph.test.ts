import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/msal", () => ({
  msalApp: vi.fn(() => ({
    acquireTokenByClientCredential: vi.fn(async () => ({ accessToken: "token-fake" })),
  })),
  SCOPES_GRAPH_APP: ["https://graph.microsoft.com/.default"],
}));

vi.mock("@/lib/auth/config", () => ({
  authConfig: { baseUrl: "https://ca-gpol-hml-aahbrant.whitesmoke-8dee35f8.brazilsouth.azurecontainerapps.io" },
}));

import { msalApp } from "@/lib/auth/msal";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";

describe("enviarNotificacaoPoliticaPublicada", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
  });

  it("prefixa 'token_graph: ' quando acquireTokenByClientCredential lança (não apenas quando volta vazio)", async () => {
    (msalApp as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      acquireTokenByClientCredential: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });

    const resultado = await enviarNotificacaoPoliticaPublicada({
      oid: "oid-123",
      tituloPolitica: "Política de Teste",
      politicaId: "pol-abc",
    });

    expect(resultado).toEqual({ ok: false, motivo: "token_graph: timeout" });
  });

  it("monta topic.webUrl como deep link Teams l/entity, não URL comum do app", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

    const resultado = await enviarNotificacaoPoliticaPublicada({
      oid: "oid-123",
      tituloPolitica: "Política de Teste",
      politicaId: "pol-abc",
    });

    expect(resultado.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0];
    const corpo = JSON.parse(init.body as string);
    const webUrl: string = corpo.topic.webUrl;

    // Graph rejeita com 400 se webUrl não começar com domínio Teams + "/l/".
    expect(webUrl.startsWith("https://teams.microsoft.com/l/entity/")).toBe(true);
    expect(webUrl).not.toContain("/catalogo/pol-abc");

    const url = new URL(webUrl);
    const params = url.searchParams;
    const urlFallback = decodeURIComponent(params.get("webUrl") ?? "");
    expect(urlFallback).toBe(
      "https://ca-gpol-hml-aahbrant.whitesmoke-8dee35f8.brazilsouth.azurecontainerapps.io/catalogo/pol-abc",
    );

    const contexto = JSON.parse(decodeURIComponent(params.get("context") ?? "{}"));
    expect(contexto.subEntityId).toBe("pol-abc");
  });

  it("retorna ok:false com o motivo do Graph quando o Graph rejeita a requisição", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("Invalid 'webUrl' specified", { status: 400 }),
      ),
    );

    const resultado = await enviarNotificacaoPoliticaPublicada({
      oid: "oid-123",
      tituloPolitica: "Política de Teste",
      politicaId: "pol-abc",
    });

    expect(resultado).toEqual({ ok: false, motivo: expect.stringContaining("graph_400") });
  });
});

import { enviarNotificacaoLembretePendencia, enviarResumoPendenciasSgi } from "@/lib/notificacao/graph";

describe("enviarNotificacaoLembretePendencia", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  it("usa activityType pendenciaLembrete e texto com o marco certo", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

    const resultado = await enviarNotificacaoLembretePendencia({
      oid: "oid-123",
      tituloPolitica: "Política de Teste",
      politicaId: "pol-abc",
      diasPendente: 7,
    });

    expect(resultado.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.activityType).toBe("pendenciaLembrete");
    expect(corpo.topic.value).toContain("7 dias");
    expect(corpo.topic.value).toContain("Política de Teste");
  });
});

describe("enviarResumoPendenciasSgi", () => {
  it("manda 1 notificacao por oid, todas com o mesmo texto-resumo", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        chamadas.push(url as string);
        return new Response(null, { status: 204 });
      }),
    );

    const resultados = await enviarResumoPendenciasSgi({
      oidsSgi: ["oid-sgi-1", "oid-sgi-2"],
      quantidade: 5,
    });

    expect(resultados).toEqual([{ ok: true }, { ok: true }]);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0]).toContain("oid-sgi-1");
    expect(chamadas[1]).toContain("oid-sgi-2");
  });

  it("quantidade 1 usa singular", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

    await enviarResumoPendenciasSgi({ oidsSgi: ["oid-sgi-1"], quantidade: 1 });

    const [, init] = fetchMock.mock.calls[0];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.topic.value).toContain("1 pessoa passou");
  });
});
