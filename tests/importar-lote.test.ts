import { describe, it, expect } from "vitest";
import { analisarNomeArquivo, NOME_AREA_POR_SIGLA } from "@/lib/politica/importarLote";
import { siglaArea } from "@/lib/politica/dominio";

describe("importação em lote: sugestão pelo nome do arquivo", () => {
  it("código oficial no nome: tipo, área e título", () => {
    const s = analisarNomeArquivo("AHBT-PRO-QUA-001_Controle-de-Documentos_2026-07.docx");
    expect(s.tipo).toBe("procedimento");
    expect(s.area).toBe("Qualidade");
    expect(s.titulo).toBe("Controle de Documentos");
  });

  it("aceita revisão no código e título com espaços", () => {
    const s = analisarNomeArquivo("AHBT-POL-RH-002-03 Política de Home Office.pdf");
    expect(s.tipo).toBe("politica");
    expect(s.area).toBe("Recursos Humanos");
    expect(s.titulo).toBe("Política de Home Office");
  });

  it("sem código: título limpo e tipo pela primeira palavra", () => {
    expect(analisarNomeArquivo("Procedimento_de_Admissão_v3.docx")).toMatchObject({
      tipo: "procedimento",
      area: null,
      titulo: "Procedimento de Admissão",
    });
    expect(analisarNomeArquivo("Instrução de trabalho - abertura de chamado (1).docx").tipo).toBe("instrucao_trabalho");
    expect(analisarNomeArquivo("Manual do Colaborador rev 2.pdf").tipo).toBe("manual");
  });

  it("nome sem pistas: só o título", () => {
    const s = analisarNomeArquivo("relatorio-final-obra.txt");
    expect(s.tipo).toBeNull();
    expect(s.area).toBeNull();
    expect(s.titulo).toBe("Relatorio final obra");
  });

  it("sigla de área desconhecida não inventa área", () => {
    expect(analisarNomeArquivo("AHBT-NOR-XYZ-010_Algo.docx").area).toBeNull();
  });

  it("nunca devolve título vazio", () => {
    expect(analisarNomeArquivo("AHBT-PRO-QUA-001.docx").titulo.length).toBeGreaterThan(0);
  });

  it("a tabela de nomes por sigla é coerente com a de siglas oficiais (dominio.ts)", () => {
    for (const [sigla, nome] of Object.entries(NOME_AREA_POR_SIGLA)) {
      expect(siglaArea(nome), nome).toBe(sigla);
    }
  });
});
