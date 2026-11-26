import path from "path";
import PDFDocument from "pdfkit";
import type { DadosDocumentoOficial } from "@/lib/politica/gerarDocx";

// PDF oficial: gerado na publicação, junto do .docx, a partir do MESMO conteúdo
// congelado (snapshot). Serve para visualizar no app sem baixar (o leitor de PDF
// funciona dentro do Teams) e para ter uma cópia que não se edita por engano.
// Tabelas saem como tabelas (no .docx elas são achatadas em "a | b").

const VINHO = "#670000";
const BEGE = "#EBE9AD";
const CINZA = "#555555";
const LINHA = "#BBBBBB";
const CAMINHO_LOGO = path.join(process.cwd(), "public", "logo", "aahbrant-logo-fundo-claro.png");

const MARGEM = 56;
const TOPO_CONTEUDO = 96; // abaixo do cabeçalho corrente
const RODAPE = 48;

export type SecaoPdf = {
  codigo: string;
  titulo: string;
  corpo: string;
  tipo?: string;
  colunas?: string[] | null;
  linhas?: string[][] | null;
};

export type DadosPdfOficial = Omit<DadosDocumentoOficial, "secoes"> & { secoes: SecaoPdf[] };

// pdfkit com fontes padrão só imprime o que o Latin-1/WinAnsi tem: troca o resto por equivalentes.
function limparTexto(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[  ]/g, " ")
    .replace(/[^\u0009\u000A -~¡-ÿ–—•…]/g, "");
}

export async function gerarPdfOficial(dados: DadosPdfOficial): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGEM, bufferPages: true, info: { Title: dados.titulo, Author: "AAHBRANT", Subject: dados.codigo ?? undefined } });
  const pedacos: Buffer[] = [];
  doc.on("data", (c: Buffer) => pedacos.push(c));
  const pronto = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  const larguraUtil = doc.page.width - MARGEM * 2;
  const limiteInferior = () => doc.page.height - RODAPE - 12;
  const codigo = dados.codigo ?? "sem código";
  const rev = String(dados.revisao).padStart(2, "0");

  const cabecalhoCorrente = () => {
    try {
      doc.image(CAMINHO_LOGO, MARGEM, 28, { height: 30 });
    } catch {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(VINHO).text("AAHBRANT", MARGEM, 36, { lineBreak: false });
    }
    doc.font("Helvetica").fontSize(8.5).fillColor(CINZA);
    doc.text(`${codigo}  |  Rev. ${rev}`, MARGEM, 38, { width: larguraUtil, align: "right", lineBreak: false });
    doc.moveTo(MARGEM, 68).lineTo(MARGEM + larguraUtil, 68).lineWidth(1.2).strokeColor(VINHO).stroke();
    doc.x = MARGEM;
    doc.y = TOPO_CONTEUDO;
  };

  // O cabeçalho corrente é desenhado em CADA página nova (inclusive a primeira).
  doc.on("pageAdded", cabecalhoCorrente);
  cabecalhoCorrente();

  const garantirEspaco = (altura: number) => {
    if (doc.y + altura > limiteInferior()) doc.addPage();
  };

  // ---- Título e identificação ----
  doc.font("Helvetica-Bold").fontSize(20).fillColor(VINHO).text(limparTexto(dados.titulo), MARGEM, doc.y, { width: larguraUtil });
  doc.moveDown(0.6);
  const meta: Array<[string, string]> = [
    ["Código", codigo],
    ["Revisão", rev],
    ["Data de emissão", dados.publicadaEm.toLocaleDateString("pt-BR")],
    ["Área responsável", dados.areaNome],
  ];
  doc.fontSize(9.5);
  for (const [rotulo, valor] of meta) {
    const y = doc.y;
    doc.font("Helvetica-Bold").fillColor(CINZA).text(`${rotulo}:`, MARGEM, y, { width: 110, lineBreak: false });
    doc.font("Helvetica").fillColor("#000000").text(limparTexto(valor), MARGEM + 112, y, { width: larguraUtil - 112 });
  }
  doc.moveDown(0.8);

  // ---- Tabela (genérica, com quebra de página e cabeçalho repetido) ----
  const desenharTabela = (colunas: string[], linhas: string[][], pesos?: number[]) => {
    const n = Math.max(colunas.length, ...linhas.map((l) => l.length), 1);
    const w = pesos ?? Array(n).fill(1);
    const soma = w.reduce((a, b) => a + b, 0);
    const largs = w.map((p) => (p / soma) * larguraUtil);
    const PAD = 4;
    const alturaLinha = (celulas: string[], negrito: boolean) => {
      doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      return (
        Math.max(...largs.map((lw, i) => doc.heightOfString(limparTexto(celulas[i] ?? ""), { width: lw - PAD * 2 }))) + PAD * 2
      );
    };
    const linha = (celulas: string[], cabecalho: boolean) => {
      const h = alturaLinha(celulas, cabecalho);
      if (doc.y + h > limiteInferior()) {
        doc.addPage();
        if (!cabecalho) linha(colunas, true); // repete o cabeçalho da tabela na página nova
      }
      const y = doc.y;
      let x = MARGEM;
      largs.forEach((lw, i) => {
        if (cabecalho) doc.rect(x, y, lw, h).fillAndStroke(BEGE, LINHA);
        else doc.rect(x, y, lw, h).lineWidth(0.5).strokeColor(LINHA).stroke();
        doc
          .font(cabecalho ? "Helvetica-Bold" : "Helvetica")
          .fontSize(8.5)
          .fillColor("#000000")
          .text(limparTexto(celulas[i] ?? ""), x + PAD, y + PAD, { width: lw - PAD * 2 });
        x += lw;
      });
      doc.x = MARGEM;
      doc.y = y + h;
    };
    if (colunas.length > 0) linha(colunas, true);
    for (const l of linhas) linha(l, false);
    doc.moveDown(0.8);
  };

  // ---- Controle de Revisões ----
  doc.font("Helvetica-Bold").fontSize(12).fillColor(VINHO).text("Controle de Revisões", MARGEM, doc.y, { width: larguraUtil });
  doc.moveDown(0.4);
  desenharTabela(
    ["Revisão", "Data", "Descrição da alteração", "Responsável"],
    dados.controleRevisoes.map((r) => [r.revisao, r.data, r.descricao, r.responsavel]),
    [1, 1.3, 4, 2.2],
  );

  // ---- Seções ----
  for (const s of dados.secoes) {
    garantirEspaco(s.tipo === "tabela" ? 100 : 60);
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(VINHO).text(`${s.codigo}. ${limparTexto(s.titulo)}`, MARGEM, doc.y, { width: larguraUtil });
    doc.moveDown(0.35);

    if (s.tipo === "tabela" && s.colunas && s.colunas.length > 0) {
      desenharTabela(s.colunas, s.linhas ?? []);
      continue;
    }
    const paragrafos = limparTexto(s.corpo).split("\n");
    for (const p of paragrafos) {
      const texto = p.trim();
      if (!texto) {
        doc.moveDown(0.3);
        continue;
      }
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      if (/^[-•]\s+/.test(texto)) {
        const item = texto.replace(/^[-•]\s+/, "");
        garantirEspaco(18);
        const y = doc.y;
        doc.text("•", MARGEM + 6, y, { lineBreak: false });
        doc.text(item, MARGEM + 20, y, { width: larguraUtil - 20, align: "left", lineGap: 1.5 });
      } else {
        doc.text(texto, MARGEM, doc.y, { width: larguraUtil, align: "justify", lineGap: 1.5 });
      }
      doc.moveDown(0.35);
    }
    doc.moveDown(0.5);
  }

  // ---- Rodapé com paginação (todas as páginas, no fim) ----
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    // O rodapé fica dentro da margem inferior: sem zerá-la, o pdfkit abre uma página nova a cada texto.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - RODAPE + 8;
    doc.moveTo(MARGEM, y - 6).lineTo(MARGEM + larguraUtil, y - 6).lineWidth(0.5).strokeColor(LINHA).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(CINZA);
    doc.text(`AAHBRANT Engenharia & Construções  |  ${codigo}  |  Rev. ${rev}`, MARGEM, y, { width: larguraUtil - 80, lineBreak: false });
    doc.text(`Página ${i + 1} de ${count}`, MARGEM, y, { width: larguraUtil, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}
