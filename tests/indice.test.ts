import { describe, it, expect } from "vitest";
import { consultaParaBusca, dividirEmTrechos, normalizarParaBusca, TAMANHO_MAXIMO_TRECHO } from "@/lib/politica/indice";

const secao = (codigo: string, titulo: string, corpo: string) => ({ codigo, titulo, tipo: "texto", corpo });

describe("índice: normalização", () => {
  it("tira acentos, põe em minúsculas e colapsa espaços", () => {
    expect(normalizarParaBusca("  Codificação  de DOCUMENTOS\n técnicos ")).toBe("codificacao de documentos tecnicos");
    expect(normalizarParaBusca("Ação, é à ç")).toBe("acao, e a c");
  });
});

describe("índice: divisão em trechos", () => {
  it("um trecho por seção curta, na ordem, com título no texto de busca", () => {
    const t = dividirEmTrechos([
      secao("1", "Objetivo", "Definir a codificação."),
      secao("2", "Diretrizes Gerais", "Todo documento tem código."),
    ]);
    expect(t).toHaveLength(2);
    expect(t.map((x) => x.ordem)).toEqual([1, 2]);
    expect(t[0]).toMatchObject({ secaoCodigo: "1", secaoTitulo: "Objetivo", parte: 1, texto: "Definir a codificação." });
    expect(t[0].textoBusca).toBe("objetivo definir a codificacao.");
  });

  it("ignora seção vazia", () => {
    expect(dividirEmTrechos([secao("1", "Objetivo", "   "), secao("2", "Abrangência", "Toda a empresa.")])).toHaveLength(1);
  });

  it("seção longa vira vários trechos, nenhum acima do limite, sem perder texto", () => {
    const paragrafos = Array.from({ length: 12 }, (_, i) => `Parágrafo ${i + 1}. ` + "palavra ".repeat(40).trim() + ".");
    const t = dividirEmTrechos([secao("5", "Responsabilidades", paragrafos.join("\n"))], 500);
    expect(t.length).toBeGreaterThan(3);
    for (const x of t) expect(x.texto.length).toBeLessThanOrEqual(500);
    expect(t.map((x) => x.parte)).toEqual(t.map((_, i) => i + 1));
    const junto = t.map((x) => x.texto).join("\n");
    for (let i = 1; i <= 12; i++) expect(junto).toContain(`Parágrafo ${i}.`);
  });

  it("parágrafo único maior que o limite é quebrado em frases/espaços", () => {
    const longo = "Frase de teste número um. ".repeat(100).trim();
    const t = dividirEmTrechos([secao("1", "Texto", longo)], 300);
    expect(t.length).toBeGreaterThan(5);
    for (const x of t) expect(x.texto.length).toBeLessThanOrEqual(300);
  });

  it("tabela vira linhas de texto (colunas e células)", () => {
    const t = dividirEmTrechos([
      { codigo: "3", titulo: "Matriz", tipo: "tabela", corpo: "", colunas: ["Cargo", "Nível"], linhas: [["Engenheiro", "A"], ["Técnico", "B"]] },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].texto).toBe("Cargo | Nível\nEngenheiro | A\nTécnico | B");
  });

  it("o limite padrão é razoável para citação", () => {
    expect(TAMANHO_MAXIMO_TRECHO).toBeGreaterThanOrEqual(800);
    expect(TAMANHO_MAXIMO_TRECHO).toBeLessThanOrEqual(2000);
  });
});

describe("índice: consulta", () => {
  it("pergunta em linguagem natural vira busca OU, sem acento e sem repetição", () => {
    expect(consultaParaBusca("Qual o procedimento de codificação e rastreabilidade? Codificação!")).toBe(
      "qual or procedimento or de or codificacao or rastreabilidade",
    );
  });

  it("modo 'todas' usa E", () => {
    expect(consultaParaBusca("codificação documentos", "todas")).toBe("codificacao documentos");
  });

  it("sem palavras úteis devolve null; limita a quantidade de palavras; ignora 'or'/'and' digitados", () => {
    expect(consultaParaBusca("?! ...")).toBeNull();
    expect(consultaParaBusca("a")).toBeNull();
    expect(consultaParaBusca("or and")).toBeNull();
    const muitas = Array.from({ length: 30 }, (_, i) => `termo${i}`).join(" ");
    expect(consultaParaBusca(muitas, "todas")!.split(" ")).toHaveLength(12);
  });
});
