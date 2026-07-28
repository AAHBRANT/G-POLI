import { describe, it, expect } from "vitest";
import {
  TIPOS_DOCUMENTO,
  tipoDocumentoValido,
  tipoDocumento,
  artigoDocumento,
} from "@/lib/constants";

// v3: 8 seções do menu (Política + 7 outros tipos). Regra que estes testes
// protegem: concordância de gênero por tipo — "Nova Norma" e "Nova Instrução de
// Trabalho" (femininas), "Novo Procedimento"/"Novo Manual"/"Novo Código"/
// "Novo Formulário"/"Novo Comunicado Normativo" (masculinos). Um erro aqui
// já aconteceu nesta mesma sessão (assumi "todos masculinos" sem checar).
describe("Tipos de documento", () => {
  it("tem exatamente 8 tipos, cada um com prefixo interno único", () => {
    expect(TIPOS_DOCUMENTO).toHaveLength(8);
    const prefixos = TIPOS_DOCUMENTO.map((t) => t.prefixo);
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });

  it("tipoDocumentoValido reconhece só os 8 valores oficiais", () => {
    for (const t of TIPOS_DOCUMENTO) expect(tipoDocumentoValido(t.valor)).toBe(true);
    expect(tipoDocumentoValido("inventado")).toBe(false);
    expect(tipoDocumentoValido("")).toBe(false);
  });

  it("tipoDocumento cai em 'politica' para valor desconhecido (nunca undefined)", () => {
    expect(tipoDocumento("nao-existe").valor).toBe("politica");
  });

  it("Norma e Instrução de Trabalho são femininas", () => {
    expect(artigoDocumento(tipoDocumento("norma")).artigo).toBe("a");
    expect(artigoDocumento(tipoDocumento("instrucao_trabalho")).artigo).toBe("a");
  });

  it("Procedimento, Manual, Código, Formulário e Comunicado Normativo são masculinos", () => {
    for (const valor of ["procedimento", "manual", "codigo", "formulario", "comunicado_normativo"]) {
      expect(artigoDocumento(tipoDocumento(valor)).artigo).toBe("o");
    }
  });

  it("artigoDocumento devolve as quatro formas consistentes com o gênero", () => {
    const f = artigoDocumento({ genero: "f" });
    expect(f).toEqual({ artigo: "a", novo: "Nova", nenhum: "Nenhuma", cadastrada: "cadastrada" });
    const m = artigoDocumento({ genero: "m" });
    expect(m).toEqual({ artigo: "o", novo: "Novo", nenhum: "Nenhum", cadastrada: "cadastrado" });
  });
});
