import { describe, it, expect } from "vitest";
import {
  ESTADO_TEAMS,
  ROTA_FIM_TEAMS,
  codificarEstadoTeams,
  decodificarEstadoTeams,
  destinoPosLogin,
  ehEstadoTeams,
  hostRedirectConfiavel,
  origemDaSessao,
} from "@/lib/auth/estado";

// Regra: login iniciado no popup do Teams tem de terminar na página que fecha o
// popup, nunca na raiz do app — senão o app renderiza dentro do popup e a aba
// do Teams continua na tela de login.
describe("destino depois do login", () => {
  it("login do popup do Teams termina na página que fecha o popup", () => {
    expect(destinoPosLogin(ESTADO_TEAMS)).toBe(ROTA_FIM_TEAMS);
  });

  it("reconhece o fluxo do Teams mesmo com parâmetros embutidos", () => {
    const state = codificarEstadoTeams({ authId: "abc" });
    expect(state).not.toBe(ESTADO_TEAMS);
    expect(destinoPosLogin(state)).toBe(ROTA_FIM_TEAMS);
  });

  it("login web termina na raiz do app", () => {
    expect(destinoPosLogin(null)).toBe("/");
  });

  it("state desconhecido é tratado como web (não abre exceção)", () => {
    expect(destinoPosLogin("qualquer-outra-coisa")).toBe("/");
    expect(destinoPosLogin("")).toBe("/");
  });
});

describe("origem registrada na sessão", () => {
  it("popup do Teams grava origem teams", () => {
    expect(origemDaSessao(ESTADO_TEAMS)).toBe("teams");
    expect(origemDaSessao(codificarEstadoTeams({ authId: "x" }))).toBe("teams");
  });

  it("qualquer outra origem grava web", () => {
    expect(origemDaSessao(null)).toBe("web");
    expect(origemDaSessao("teams-falso")).toBe("web");
  });
});

// Os parâmetros do Teams precisam sobreviver à ida ao Entra: é por eles que o
// popup avisa o host. Perdê-los foi a causa de "No Parent window found".
describe("parâmetros do Teams no state", () => {
  it("ida e volta preserva os três parâmetros", () => {
    const p = {
      authId: "1a2b-3c",
      metodo: "deeplink",
      hostRedirectUrl: "https://teams.microsoft.com/retorno",
    };
    expect(decodificarEstadoTeams(codificarEstadoTeams(p))).toEqual(p);
  });

  it("sem parâmetros ainda marca o fluxo como Teams", () => {
    expect(codificarEstadoTeams()).toBe(ESTADO_TEAMS);
    expect(decodificarEstadoTeams(ESTADO_TEAMS)).toEqual({});
    expect(ehEstadoTeams(ESTADO_TEAMS)).toBe(true);
  });

  it("state que não é do Teams devolve null", () => {
    expect(decodificarEstadoTeams(null)).toBeNull();
    expect(decodificarEstadoTeams("outro")).toBeNull();
    expect(ehEstadoTeams("teams-falso")).toBe(false);
  });

  it("carga corrompida não derruba o login — cai para vazio", () => {
    expect(decodificarEstadoTeams("teams.###nao-e-base64###")).toEqual({});
    expect(decodificarEstadoTeams("teams.")).toEqual({});
  });

  it("ignora campo de tipo inesperado na carga", () => {
    const carga = Buffer.from(JSON.stringify({ authId: 42 }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodificarEstadoTeams(`teams.${carga}`)).toEqual({
      authId: undefined,
      metodo: undefined,
      hostRedirectUrl: undefined,
    });
  });
});

// O hostRedirectUrl chega pela query string: é entrada não confiável. Sem
// allowlist, viraria open redirect no nosso domínio.
describe("allowlist do hostRedirectUrl", () => {
  it("aceita hosts do Teams e da Microsoft em https", () => {
    for (const u of [
      "https://teams.microsoft.com/qualquer",
      "https://br.teams.microsoft.com/x",
      "https://teams.cloud.microsoft/x",
      "https://teams.live.com/x",
      "https://www.office.com/x",
      "https://cloud.microsoft/x",
    ]) {
      expect(hostRedirectConfiavel(u), u).toBe(true);
    }
  });

  it("recusa host de terceiro", () => {
    expect(hostRedirectConfiavel("https://atacante.example/roubo")).toBe(false);
  });

  it("recusa sufixo que imita host confiável", () => {
    // O caso que uma checagem por `includes` deixaria passar.
    expect(hostRedirectConfiavel("https://teams.microsoft.com.atacante.br/x")).toBe(false);
    expect(hostRedirectConfiavel("https://falsoteams.microsoft.com.br/x")).toBe(false);
  });

  it("recusa http, mesmo em host confiável", () => {
    expect(hostRedirectConfiavel("http://teams.microsoft.com/x")).toBe(false);
  });

  it("recusa esquema perigoso e valor inválido", () => {
    expect(hostRedirectConfiavel("javascript:alert(1)")).toBe(false);
    expect(hostRedirectConfiavel("//teams.microsoft.com/x")).toBe(false);
    expect(hostRedirectConfiavel("nao-e-url")).toBe(false);
    expect(hostRedirectConfiavel(undefined)).toBe(false);
    expect(hostRedirectConfiavel("")).toBe(false);
  });

  it("ignora diferença de caixa no host", () => {
    expect(hostRedirectConfiavel("https://TEAMS.MICROSOFT.COM/x")).toBe(true);
  });
});
