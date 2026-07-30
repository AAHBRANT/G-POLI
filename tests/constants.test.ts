import { describe, it, expect } from "vitest";
import {
  TIPOS_DOCUMENTO,
  tipoDocumentoValido,
  tipoDocumento,
  artigoDocumento,
} from "@/lib/constants";

// v3: 6 seções do menu (Política + 5 outros tipos). "Norma" e "Código" foram
// removidos (2026-07-30): sem sigla TD oficial correspondente na tabela do
// SGI — ver comentário em lib/constants.ts. Regra que estes testes protegem:
// concordância de gênero por tipo — "Nova Instrução de Trabalho" (feminina),
// "Novo Procedimento"/"Novo Manual"/"Novo Formulário"/"Novo Comunicado
// Normativo" (masculinos). Um erro aqui já aconteceu nesta mesma sessão
// (assumi "todos masculinos" sem checar).
describe("Tipos de documento", () => {
  it("tem exatamente 6 tipos, cada um com prefixo interno único", () => {
    expect(TIPOS_DOCUMENTO).toHaveLength(6);
    const prefixos = TIPOS_DOCUMENTO.map((t) => t.prefixo);
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });

  it("tipoDocumentoValido reconhece só os 6 valores oficiais", () => {
    for (const t of TIPOS_DOCUMENTO) expect(tipoDocumentoValido(t.valor)).toBe(true);
    expect(tipoDocumentoValido("norma")).toBe(false);
    expect(tipoDocumentoValido("codigo")).toBe(false);
    expect(tipoDocumentoValido("inventado")).toBe(false);
    expect(tipoDocumentoValido("")).toBe(false);
  });

  it("tipoDocumento cai em 'politica' para valor desconhecido (nunca undefined)", () => {
    expect(tipoDocumento("nao-existe").valor).toBe("politica");
  });

  it("Instrução de Trabalho é feminina", () => {
    expect(artigoDocumento(tipoDocumento("instrucao_trabalho")).artigo).toBe("a");
  });

  it("Procedimento, Manual, Formulário e Comunicado Normativo são masculinos", () => {
    for (const valor of ["procedimento", "manual", "formulario", "comunicado_normativo"]) {
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
