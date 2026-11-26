import { describe, it, expect } from "vitest";
import { gerarPdfOficial } from "@/lib/politica/gerarPdf";

const base = {
  titulo: "Procedimento de Teste",
  codigo: "AHBT-PRO-SGI-001",
  publicadaEm: new Date("2026-11-26T12:00:00Z"),
  areaNome: "Sistema de Gestão Integrado",
  revisao: 0,
  controleRevisoes: [{ revisao: "00", data: "26/11/2026", descricao: "Emissão inicial do documento", responsavel: "Fulano" }],
};

const paginas = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("PDF oficial", () => {
  it("gera um PDF válido de 1 página com texto e tabela", async () => {
    const pdf = await gerarPdfOficial({
      ...base,
      secoes: [
        { codigo: "1", titulo: "Objetivo", corpo: "Definir o controle.\n- item um\n- item dois", tipo: "texto" },
        { codigo: "2", titulo: "Siglas", corpo: "", tipo: "tabela", colunas: ["Sigla", "Significado"], linhas: [["SGI", "Sistema de Gestão"]] },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas(pdf)).toBe(1); // sem página em branco extra por causa do rodapé
  });

  it("quebra em várias páginas sem página vazia e aceita caracteres fora do Latin-1", async () => {
    const longo = Array.from({ length: 120 }, (_, i) => `Parágrafo ${i + 1} — ação “prevista” ≥ 2 itens.`).join("\n");
    const pdf = await gerarPdfOficial({ ...base, secoes: [{ codigo: "1", titulo: "Descrição", corpo: longo, tipo: "texto" }] });
    expect(paginas(pdf)).toBeGreaterThan(1);
    expect(paginas(pdf)).toBeLessThan(8);
  });

  it("tabela longa repete e continua na página seguinte", async () => {
    const linhas = Array.from({ length: 80 }, (_, i) => [`Item ${i + 1}`, "Descrição do item com algum texto"]);
    const pdf = await gerarPdfOficial({ ...base, secoes: [{ codigo: "1", titulo: "Itens", corpo: "", tipo: "tabela", colunas: ["Item", "Descrição"], linhas }] });
    expect(paginas(pdf)).toBeGreaterThan(1);
  });
});
