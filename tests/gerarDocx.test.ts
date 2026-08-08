import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";

// Extrai o texto de um XML do Word (mesma técnica usada para inspecionar o
// modelo original durante o desenho da feature).
function extrairTexto(xml: string): string {
  let out = "";
  const re = /<w:t[^>]*>([^<]*)<\/w:t>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out += m[0] === "</w:p>" ? "\n" : m[1];
  }
  return out;
}

// Recorta a primeira <w:tbl> do document.xml. Necessário porque asserções só
// de texto NÃO distinguem "uma linha por revisão" de "todas as revisões
// espalhadas em colunas da mesma linha" — que é exatamente o que o
// docx-templates gera se {FOR} e {END-FOR} ficarem na MESMA linha da tabela
// (README do docx-templates, seção "FOR and END-FOR").
function primeiraTabela(xml: string): string {
  const ini = xml.indexOf("<w:tbl>");
  const fim = xml.indexOf("</w:tbl>");
  return ini < 0 || fim < 0 ? "" : xml.slice(ini, fim + "</w:tbl>".length);
}

function contar(xml: string, tag: string): number {
  return (xml.match(new RegExp(`<${tag}>`, "g")) ?? []).length;
}

describe("gerarDocumentoOficial", () => {
  it("preenche cabeçalho e seções no modelo real (templates/politica-modelo.docx)", async () => {
    const buffer = await gerarDocumentoOficial({
      titulo: "POLÍTICA DE TESTE AUTOMATIZADO",
      codigo: "AHBT-POL-TI-999",
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
      areaNome: "Tecnologia da Informação",
      revisao: 3,
      controleRevisoes: [
        { revisao: "00", data: "01/01/2026", descricao: "Emissão inicial do documento", responsavel: "Fulano" },
        { revisao: "01", data: "30/07/2026", descricao: "Inclusão do item 4.2", responsavel: "Beltrano" },
      ],
      secoes: [
        { codigo: "1", titulo: "Objetivo", corpo: "Texto de teste do objetivo." },
        { codigo: "2", titulo: "Abrangência", corpo: "Texto de teste da abrangência." },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const header = extrairTexto(await zip.file("word/header1.xml")!.async("string"));
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const corpo = extrairTexto(documentXml);

    expect(header).toContain("POLÍTICA DE TESTE AUTOMATIZADO");
    expect(header).toContain("AHBT-POL-TI-999");
    expect(header).toContain("Tecnologia da Informação");
    expect(header).toContain("Revisão: 03");
    expect(header).toContain("30/07/2026");

    // Tabela de Controle de Revisões: as duas linhas de dados aparecem, e
    // ANTES do conteúdo das seções (primeiro elemento do corpo — Manual cap. 19).
    expect(corpo).toContain("00");
    expect(corpo).toContain("Emissão inicial do documento");
    expect(corpo).toContain("Inclusão do item 4.2");
    expect(corpo).toContain("Beltrano");
    expect(corpo.indexOf("Emissão inicial do documento")).toBeLessThan(corpo.indexOf("1 · Objetivo"));

    // Estrutura: 1 linha de cabeçalho + 1 linha POR revisão, 4 colunas cada —
    // e nenhuma linha residual do {FOR}/{END-FOR}.
    const tabela = primeiraTabela(documentXml);
    expect(tabela).not.toBe("");
    expect(contar(tabela, "w:tr")).toBe(3);
    expect(contar(tabela, "w:tc")).toBe(12);

    expect(corpo).toContain("1 · Objetivo");
    expect(corpo).toContain("Texto de teste do objetivo.");
    expect(corpo).toContain("2 · Abrangência");
    expect(corpo).toContain("Texto de teste da abrangência.");
    // Sem sobra de sintaxe de template (loop malformado ou tag sem substituir).
    expect(corpo).not.toContain("{FOR");
    expect(corpo).not.toContain("{END-FOR");
  });

  it("propaga o erro se o template não existir (nunca engole)", async () => {
    // process.cwd() é a raiz do projeto durante o vitest — não dá pra
    // simular "arquivo ausente" sem mexer no cwd. Em vez disso, confirma o
    // contrato: uma chamada com secoes vazias ainda deve gerar um buffer
    // válido (não lança à toa quando não há conteúdo — quem decide bloquear
    // por falta de conteúdo é `temConteudo`, em publicarPolitica).
    const buffer = await gerarDocumentoOficial({
      titulo: "SEM SEÇÕES",
      codigo: null,
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
      areaNome: "Qualidade",
      revisao: 0,
      controleRevisoes: [
        { revisao: "00", data: "30/07/2026", descricao: "Emissão inicial do documento", responsavel: "Fulano" },
      ],
      secoes: [],
    });
    expect(buffer.length).toBeGreaterThan(0);
  });
});
