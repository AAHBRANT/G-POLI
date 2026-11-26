import { describe, it, expect } from "vitest";
import { extrairEstrutura, detectarCapitulosEmLinhas, tituloLegivel } from "@/lib/politica/importarEstrutura";
import { extrairDeTextoSimples } from "@/lib/politica/importarDocumento";

const html = [
  "<p>PROCEDIMENTO DE CONTROLE</p>",
  "<table><tr><td>Revisão</td><td>Data</td></tr><tr><td>00</td><td>01/01/2026</td></tr></table>",
  "<p>1 OBJETIVO</p>",
  "<p>Definir o controle.</p>",
  "<p>2 DEFINIÇÕES E SIGLAS</p>",
  "<p>Tabela 1 – Siglas</p>",
  "<table><tr><th>Sigla</th><th>Significado</th></tr><tr><td>SGI</td><td>Sistema de Gestão</td></tr></table>",
  "<p>Fonte: AAHBRANT</p>",
  "<p>3 RESPONSABILIDADES</p>",
  "<ul><li>Gestor aprova</li></ul>",
  "<p>4 DOCUMENTOS DE REFERÊNCIA</p>",
  "<p>ISO 9001.</p>",
].join("");

describe("importar estrutura: capítulos numerados e tabelas", () => {
  const r = extrairEstrutura(html);

  it("separa por capítulos e reescreve títulos em maiúsculas", () => {
    const titulos = r.secoes.map((s) => s.titulo);
    expect(titulos).toContain("Objetivo");
    expect(titulos).toContain("Responsabilidades");
    expect(titulos).toContain("Documentos de Referência");
    expect(r.capitulos).toBe(4);
  });

  it("mantém a tabela como tabela, com legenda e fonte", () => {
    const t = r.secoes.find((s) => s.tipo === "tabela");
    expect(t?.colunas).toEqual(["Sigla", "Significado"]);
    expect(t?.linhas).toEqual([["SGI", "Sistema de Gestão"]]);
    expect(t?.titulo).toContain("Tabela 1 – Siglas");
    expect(r.tabelas).toBe(1);
  });

  it("ignora o cabeçalho do original e avisa", () => {
    expect(r.secoes.some((s) => s.corpo.includes("PROCEDIMENTO DE CONTROLE"))).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/cabeçalho do original/);
  });

  it("itens de lista viram marcadores", () => {
    expect(r.secoes.find((s) => s.titulo === "Responsabilidades")?.corpo).toBe("- Gestor aprova");
  });
});

describe("importar estrutura: texto simples", () => {
  it("detecta capítulos só com 3 ou mais em sequência", () => {
    expect(detectarCapitulosEmLinhas(["1 OBJETIVO", "x", "2 CAMPO"]).size).toBe(0);
    expect(detectarCapitulosEmLinhas(["1 OBJETIVO", "x", "2 CAMPO", "y", "3 DEFINIÇÕES"]).size).toBe(3);
  });
  it("extrairDeTextoSimples usa os capítulos numerados", () => {
    const s = extrairDeTextoSimples("1 OBJETIVO\nTexto a.\n2 CAMPO DE APLICAÇÃO\nTexto b.\n3 RESPONSABILIDADES\nTexto c.");
    expect(s.map((x) => x.titulo)).toEqual(["Objetivo", "Campo de Aplicação", "Responsabilidades"]);
  });
  it("tituloLegivel mantém conectivos em minúsculas", () => {
    expect(tituloLegivel("DEFINIÇÕES E SIGLAS")).toBe("Definições e Siglas");
  });
});
