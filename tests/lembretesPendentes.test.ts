import { describe, it, expect } from "vitest";
import {
  lembretesPendentes,
  nivelUrgenciaPendencia,
  classesUrgenciaPendencia,
} from "@/lib/politica/lembretesPendentes";

function pendenciaBase(overrides: Partial<{
  criadaEm: Date;
  lembrete3EnviadoEm: Date | null;
  lembrete7EnviadoEm: Date | null;
  lembrete15EnviadoEm: Date | null;
}> = {}) {
  return {
    criadaEm: new Date("2026-01-01T00:00:00Z"),
    lembrete3EnviadoEm: null,
    lembrete7EnviadoEm: null,
    lembrete15EnviadoEm: null,
    ...overrides,
  };
}

describe("lembretesPendentes", () => {
  it("0 dias: nenhum marco", () => {
    const agora = new Date("2026-01-01T05:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([]);
  });

  it("exatos 3 dias: dispara marco 3", () => {
    const agora = new Date("2026-01-04T00:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([3]);
  });

  it("exatos 7 dias: dispara marco 7 (3 já não entra, pois não foi passado no teste como pendente de novo)", () => {
    const agora = new Date("2026-01-08T00:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([3, 7]);
  });

  it("exatos 15 dias: dispara os 3 marcos juntos (job nunca rodou antes)", () => {
    const agora = new Date("2026-01-16T00:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([3, 7, 15]);
  });

  it("marco já enviado não repete", () => {
    const agora = new Date("2026-01-16T00:00:00Z");
    const pendencia = pendenciaBase({
      lembrete3EnviadoEm: new Date("2026-01-04T00:00:00Z"),
      lembrete7EnviadoEm: new Date("2026-01-08T00:00:00Z"),
    });
    expect(lembretesPendentes(pendencia, agora)).toEqual([15]);
  });

  it("todos os marcos já enviados: nenhum novo", () => {
    const agora = new Date("2026-01-20T00:00:00Z");
    const pendencia = pendenciaBase({
      lembrete3EnviadoEm: new Date("2026-01-04T00:00:00Z"),
      lembrete7EnviadoEm: new Date("2026-01-08T00:00:00Z"),
      lembrete15EnviadoEm: new Date("2026-01-16T00:00:00Z"),
    });
    expect(lembretesPendentes(pendencia, agora)).toEqual([]);
  });

  it("2 dias e 23 horas: ainda não vira 3 dias (arredonda pra baixo)", () => {
    const agora = new Date("2026-01-03T23:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([]);
  });
});

describe("nivelUrgenciaPendencia", () => {
  it("0-2 dias: normal", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-02T00:00:00Z"))).toBe("normal");
  });

  it("3-6 dias: atencao", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-04T00:00:00Z"))).toBe("atencao");
  });

  it("7-14 dias: alerta", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-08T00:00:00Z"))).toBe("alerta");
  });

  it("15+ dias: critico", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-16T00:00:00Z"))).toBe("critico");
  });
});

describe("classesUrgenciaPendencia", () => {
  it("normal não adiciona destaque", () => {
    expect(classesUrgenciaPendencia("normal")).toBe("");
  });

  it("critico usa vermelho", () => {
    expect(classesUrgenciaPendencia("critico")).toContain("red");
  });
});
