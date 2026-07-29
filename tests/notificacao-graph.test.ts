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

import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";

describe("enviarNotificacaoPoliticaPublicada", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
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
