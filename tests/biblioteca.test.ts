import { describe, it, expect } from "vitest";
import {
  normalizarParamsBiblioteca,
  temCriterioBiblioteca,
  whereBiblioteca,
  whereBase,
  hrefBiblioteca,
} from "@/lib/politica/biblioteca";

describe("biblioteca: parâmetros", () => {
  it("normaliza espaços, limita a busca e descarta tipo/estado inválidos", () => {
    const p = normalizarParamsBiblioteca({ q: "  codificação  ", tipo: "inventado", area: " a1 ", estado: "xyz" });
    expect(p).toEqual({ q: "codificação", tipo: "", areaId: "a1", estado: "" });
    expect(normalizarParamsBiblioteca({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("aceita tipo e estado válidos", () => {
    const p = normalizarParamsBiblioteca({ tipo: "procedimento", estado: "rascunho" });
    expect(p.tipo).toBe("procedimento");
    expect(p.estado).toBe("rascunho");
  });

  it("sem filtros não há critério", () => {
    expect(temCriterioBiblioteca(normalizarParamsBiblioteca({}))).toBe(false);
    expect(temCriterioBiblioteca(normalizarParamsBiblioteca({ estado: "revogada" }))).toBe(true);
  });
});

describe("biblioteca: filtro", () => {
  const visib = { OR: [{ areaId: "x" }] };

  it("sempre aplica a visibilidade do usuário, mesmo sem filtros", () => {
    const w = whereBiblioteca(visib, normalizarParamsBiblioteca({}));
    expect(w.AND).toContainEqual(visib);
  });

  it("não força estado quando não há filtro (a visibilidade decide o que cada perfil vê)", () => {
    const w = whereBiblioteca(visib, normalizarParamsBiblioteca({}));
    expect(w.AND.some((c) => "estado" in c)).toBe(false);
  });

  it("base restringe ao tipo da tela", () => {
    expect(whereBase({}, "manual").AND).toContainEqual({ tipo: "manual" });
    expect(whereBase({}).AND).toEqual([{}]);
  });

  it("combina tipo, setor, estado e busca (título, código, seções e tabelas)", () => {
    const p = normalizarParamsBiblioteca({ q: "rastreab", tipo: "procedimento", area: "a1", estado: "publicada" });
    const w = whereBiblioteca(visib, p, ["id-tabela"]);
    expect(w.AND).toContainEqual({ tipo: "procedimento" });
    expect(w.AND).toContainEqual({ areaId: "a1" });
    expect(w.AND).toContainEqual({ estado: "publicada" });
    const busca = w.AND.find((c) => "OR" in c && (c as { OR: unknown[] }).OR.length === 4) as { OR: unknown[] };
    expect(busca).toBeTruthy();
    expect(busca.OR).toContainEqual({ id: { in: ["id-tabela"] } });
  });
});

describe("biblioteca: links", () => {
  it("preserva filtros, respeita a tela de origem e permite trocar um", () => {
    const p = normalizarParamsBiblioteca({ q: "abc", tipo: "manual", estado: "rascunho" });
    expect(hrefBiblioteca("/busca", p, { tipo: "" })).toBe("/busca?q=abc&estado=rascunho");
    expect(hrefBiblioteca("/catalogo", p, { q: "", tipo: "", estado: "" })).toBe("/catalogo");
    expect(hrefBiblioteca("/tipos/manual", p, { areaId: "a1" })).toBe(
      "/tipos/manual?q=abc&tipo=manual&area=a1&estado=rascunho",
    );
  });
});
