import { describe, it, expect } from "vitest";
import { dadosPendencia } from "@/lib/politica/pendencia";

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
