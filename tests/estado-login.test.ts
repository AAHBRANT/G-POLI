import { describe, it, expect } from "vitest";
import {
  ESTADO_TEAMS,
  ROTA_FIM_TEAMS,
  destinoPosLogin,
  origemDaSessao,
} from "@/lib/auth/estado";

// Regra: login iniciado no popup do Teams tem de terminar na página que fecha o
// popup, nunca na raiz do app -- senão o app renderiza dentro do popup e a aba
// do Teams continua na tela de login.
describe("destino depois do login", () => {
  it("login do popup do Teams termina na página que fecha o popup", () => {
    expect(destinoPosLogin(ESTADO_TEAMS)).toBe(ROTA_FIM_TEAMS);
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
  });

  it("qualquer outra origem grava web", () => {
    expect(origemDaSessao(null)).toBe("web");
    expect(origemDaSessao("teams-falso")).toBe("web");
  });
});
