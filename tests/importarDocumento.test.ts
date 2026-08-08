import { describe, it, expect } from "vitest";
import {
  agruparEmSecoes,
  extrairDeMarkdown,
  extrairDeTextoSimples,
  extrairDeHtml,
  extensaoSuportada,
} from "@/lib/politica/importarDocumento";

describe("agruparEmSecoes", () => {
  it("agrupa parágrafos sob o título de nível 1 mais recente", () => {
    const r = agruparEmSecoes([
      { texto: "Objetivo", nivel: 1 },
      { texto: "Primeira linha.", nivel: null },
      { texto: "Segunda linha.", nivel: null },
      { texto: "Abrangência", nivel: 1 },
      { texto: "Outro texto.", nivel: null },
    ]);
    expect(r).toEqual([
      { titulo: "Objetivo", corpo: "Primeira linha.\nSegunda linha." },
      { titulo: "Abrangência", corpo: "Outro texto." },
    ]);
  });

  it("nível 2+ (subcapítulo) vira texto DENTRO da seção do capítulo atual, não seção própria", () => {
    const r = agruparEmSecoes([
      { texto: "7 Descrição do Procedimento", nivel: 1 },
      { texto: "Texto introdutório do capítulo.", nivel: null },
      { texto: "7.1 Réplica do Modelo-Mestre", nivel: 2 },
      { texto: "Texto do subitem 7.1.", nivel: null },
      { texto: "7.2 Identificação dos Aspectos", nivel: 2 },
      { texto: "Texto do subitem 7.2.", nivel: null },
    ]);
    expect(r).toEqual([
      {
        titulo: "7 Descrição do Procedimento",
        corpo:
          "Texto introdutório do capítulo.\n7.1 Réplica do Modelo-Mestre\nTexto do subitem 7.1.\n7.2 Identificação dos Aspectos\nTexto do subitem 7.2.",
      },
    ]);
  });

  it("sem título nenhum: tudo cai numa seção 'Conteúdo Importado'", () => {
    const r = agruparEmSecoes([
      { texto: "Linha 1.", nivel: null },
      { texto: "Linha 2.", nivel: null },
    ]);
    expect(r).toEqual([{ titulo: "Conteúdo Importado", corpo: "Linha 1.\nLinha 2." }]);
  });

  it("ignora linhas em branco", () => {
    const r = agruparEmSecoes([
      { texto: "Título", nivel: 1 },
      { texto: "", nivel: null },
      { texto: "Texto.", nivel: null },
    ]);
    expect(r).toEqual([{ titulo: "Título", corpo: "Texto." }]);
  });

  it("título sem nenhum corpo depois (ex.: rodapé de página '-- 1 de 3 --') é descartado, não vira seção vazia", () => {
    const r = agruparEmSecoes([
      { texto: "Objetivo", nivel: 1 },
      { texto: "Texto do objetivo.", nivel: null },
      { texto: "-- 1 de 3 --", nivel: 1 },
    ]);
    expect(r).toEqual([{ titulo: "Objetivo", corpo: "Texto do objetivo." }]);
  });

  it("texto antes do primeiro capítulo é descartado quando o documento TEM capítulo (cabeçalho antigo do arquivo)", () => {
    const r = agruparEmSecoes([
      { texto: "PROCEDIMENTO X — Código: AHBT-PRO-MA-002-00 — Revisão: 00", nivel: null },
      { texto: "Capítulo 1", nivel: 1 },
      { texto: "Corpo do capítulo.", nivel: null },
    ]);
    expect(r).toEqual([{ titulo: "Capítulo 1", corpo: "Corpo do capítulo." }]);
  });
});

describe("extrairDeMarkdown", () => {
  it("título # vira seção nova; ## fica como texto dentro do capítulo, preservando listas/numeração", () => {
    const md = [
      "# Objetivo",
      "Este documento estabelece:",
      "- item um",
      "- item dois",
      "",
      "## Abrangência",
      "1. primeiro",
      "2. segundo",
    ].join("\n");

    const r = extrairDeMarkdown(md);

    expect(r).toEqual([
      {
        titulo: "Objetivo",
        corpo: "Este documento estabelece:\n- item um\n- item dois\nAbrangência\n1. primeiro\n2. segundo",
      },
    ]);
  });

  it("dois títulos de nível 1 viram duas seções", () => {
    const md = "# Objetivo\nTexto 1.\n\n# Abrangência\nTexto 2.";
    const r = extrairDeMarkdown(md);
    expect(r).toEqual([
      { titulo: "Objetivo", corpo: "Texto 1." },
      { titulo: "Abrangência", corpo: "Texto 2." },
    ]);
  });
});

describe("extrairDeTextoSimples", () => {
  it("linha curta sem pontuação final, isolada por linhas em branco, é tratada como título", () => {
    const texto = ["Objetivo", "", "Texto do objetivo em detalhe.", "", "Abrangência", "", "Texto da abrangência."].join(
      "\n",
    );

    const r = extrairDeTextoSimples(texto);

    expect(r).toEqual([
      { titulo: "Objetivo", corpo: "Texto do objetivo em detalhe." },
      { titulo: "Abrangência", corpo: "Texto da abrangência." },
    ]);
  });

  it("documento sem nenhum título detectável: 1 seção só, texto preservado", () => {
    const texto = "Isto é um parágrafo corrido, com pontuação no final da linha.";
    const r = extrairDeTextoSimples(texto);
    expect(r).toEqual([{ titulo: "Conteúdo Importado", corpo: texto }]);
  });
});

describe("extrairDeHtml", () => {
  it("h1 vira seção nova; h2-h4 viram texto dentro do capítulo atual (subcapítulo, não seção separada)", () => {
    const html =
      "<h1>7 Descrição do Procedimento</h1><p>Texto intro.</p><h2>7.1 Réplica do Modelo-Mestre</h2><p>Texto do 7.1.</p><h1>8 Fluxograma</h1><p>Texto do capítulo 8.</p>";
    const r = extrairDeHtml(html);
    expect(r).toEqual([
      {
        titulo: "7 Descrição do Procedimento",
        corpo: "Texto intro.\n7.1 Réplica do Modelo-Mestre\nTexto do 7.1.",
      },
      { titulo: "8 Fluxograma", corpo: "Texto do capítulo 8." },
    ]);
  });

  it("sem heading nenhum: parágrafos vão pra 'Conteúdo Importado'", () => {
    const html = "<p>Só um parágrafo.</p>";
    const r = extrairDeHtml(html);
    expect(r).toEqual([{ titulo: "Conteúdo Importado", corpo: "Só um parágrafo." }]);
  });
});

describe("extensaoSuportada", () => {
  it("aceita docx, pdf, txt, md (case-insensitive)", () => {
    expect(extensaoSuportada("manual.DOCX")).toBe("docx");
    expect(extensaoSuportada("relatorio.pdf")).toBe("pdf");
    expect(extensaoSuportada("notas.txt")).toBe("txt");
    expect(extensaoSuportada("readme.md")).toBe("md");
  });

  it("rejeita extensão não suportada ou ausente", () => {
    expect(extensaoSuportada("planilha.xlsx")).toBeNull();
    expect(extensaoSuportada("sem-extensao")).toBeNull();
  });
});
