import { describe, it, expect } from "vitest";
import { dadosPendencia, politicasParaNovoUsuario } from "@/lib/politica/pendencia";

describe("dadosPendencia", () => {
  it("gera uma linha por usuário-alvo, todas pendente, com o mesmo tipo e publicadaEm", () => {
    const publicadaEm = new Date("2026-07-30T12:00:00Z");
    const alvos = [
      { id: "u1", oid: "oid1", nome: "Ana", email: "ana@aahbrant.com" },
      { id: "u2", oid: "oid2", nome: "Bruno", email: "bruno@aahbrant.com" },
    ];
    const linhas = dadosPendencia("pol1", "politica", publicadaEm, alvos);
    expect(linhas).toEqual([
      { politicaId: "pol1", usuarioId: "u1", politicaPublicadaEm: publicadaEm, tipo: "politica", estado: "pendente" },
      { politicaId: "pol1", usuarioId: "u2", politicaPublicadaEm: publicadaEm, tipo: "politica", estado: "pendente" },
    ]);
  });

  it("audiência vazia gera lista vazia", () => {
    expect(dadosPendencia("pol1", "politica", new Date(), [])).toEqual([]);
  });
});

describe("politicasParaNovoUsuario", () => {
  const politicaAberta = { id: "p-aberta", tipo: "politica", publicadaEm: new Date("2026-08-01"), setorIds: [] };
  const politicaSetorTI = { id: "p-ti", tipo: "norma", publicadaEm: new Date("2026-08-02"), setorIds: ["setor-ti"] };
  const politicaSetorRH = { id: "p-rh", tipo: "manual", publicadaEm: new Date("2026-08-03"), setorIds: ["setor-rh"] };

  it("inclui política de audiência aberta (setorIds vazio) mesmo se o usuário não tem setor", () => {
    const r = politicasParaNovoUsuario([politicaAberta], []);
    expect(r).toEqual([politicaAberta]);
  });

  it("inclui política restrita a setor quando o usuário está nesse setor", () => {
    const r = politicasParaNovoUsuario([politicaSetorTI], ["setor-ti"]);
    expect(r).toEqual([politicaSetorTI]);
  });

  it("exclui política restrita a setor quando o usuário não está em nenhum dos setores dela", () => {
    const r = politicasParaNovoUsuario([politicaSetorTI], ["setor-rh"]);
    expect(r).toEqual([]);
  });

  it("usuário sem nenhum setor não entra em política restrita a setor", () => {
    const r = politicasParaNovoUsuario([politicaSetorTI], []);
    expect(r).toEqual([]);
  });

  it("filtra corretamente numa lista mista", () => {
    const r = politicasParaNovoUsuario([politicaAberta, politicaSetorTI, politicaSetorRH], ["setor-ti"]);
    expect(r).toEqual([politicaAberta, politicaSetorTI]);
  });

  it("lista de políticas vazia retorna lista vazia", () => {
    expect(politicasParaNovoUsuario([], ["setor-ti"])).toEqual([]);
  });
});
