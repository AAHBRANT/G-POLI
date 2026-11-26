import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  chaveUsuario,
  criarLimitador,
  fontesDe,
  formatarResultadoBusca,
  validarMensagem,
  TAMANHO_MAXIMO_MENSAGEM,
} from "@/lib/consulta/regras";
import type { TrechoEncontrado } from "@/lib/politica/indiceServidor";

const trecho = (p: Partial<TrechoEncontrado> = {}): TrechoEncontrado => ({
  trechoId: "t1",
  politicaId: "p1",
  codigo: "AHBT-PRO-QUA-001",
  titulo: "Controle de Documentos",
  tipo: "procedimento",
  revisao: 2,
  area: "Qualidade",
  secaoCodigo: "5",
  secaoTitulo: "Diretrizes",
  texto: "Todo documento recebe um código.",
  relevancia: 0.5,
  ...p,
});

describe("consulta: validação da pergunta", () => {
  it("aceita texto normal (com trim) e recusa vazio, tipo errado e texto longo demais", () => {
    expect(validarMensagem("  Como codificar?  ")).toEqual({ ok: true, texto: "Como codificar?" });
    expect(validarMensagem("   ").ok).toBe(false);
    expect(validarMensagem(undefined).ok).toBe(false);
    expect(validarMensagem(123).ok).toBe(false);
    expect(validarMensagem("a".repeat(TAMANHO_MAXIMO_MENSAGEM + 1)).ok).toBe(false);
    expect(validarMensagem("a".repeat(TAMANHO_MAXIMO_MENSAGEM)).ok).toBe(true);
  });
});

describe("consulta: chave do dono da sessão", () => {
  it("é estável, anônima e diferente entre pessoas", () => {
    const a = chaveUsuario({ oid: "OID-1", email: "a@x.com" });
    expect(a).toBe(chaveUsuario({ oid: "oid-1", email: "outro@x.com" })); // usa o oid, sem diferenciar caixa
    expect(a).not.toBe(chaveUsuario({ oid: "oid-2", email: "a@x.com" }));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("oid");
  });
  it("sem oid usa o e-mail", () => {
    expect(chaveUsuario({ oid: "", email: "A@x.com" })).toBe(chaveUsuario({ oid: "", email: "a@x.com" }));
  });
});

describe("consulta: resultado da ferramenta e fontes", () => {
  it("formata código, título, tipo, revisão, área, seção e texto", () => {
    const r = formatarResultadoBusca([trecho(), trecho({ trechoId: "t2", politicaId: "p2", codigo: null, titulo: "Outra", revisao: 0, secaoCodigo: "1", secaoTitulo: "Objetivo", texto: "Definir." })]);
    expect(r).toContain("[1] AHBT-PRO-QUA-001 — Controle de Documentos (Procedimento, Rev. 2, área Qualidade; seção 5. Diretrizes)");
    expect(r).toContain("Todo documento recebe um código.");
    expect(r).toContain("[2] sem código — Outra");
    expect(r).toContain("---");
  });
  it("sem trechos: mensagem clara de que não há documento", () => {
    expect(formatarResultadoBusca([])).toMatch(/nenhum documento encontrado/);
  });
  it("fontes únicas por documento e seção, na ordem", () => {
    const f = fontesDe([trecho(), trecho({ trechoId: "t1b" }), trecho({ trechoId: "t3", secaoCodigo: "6", secaoTitulo: "Registros" }), trecho({ trechoId: "t4", politicaId: "p9", codigo: "POL-1" })]);
    expect(f.map((x) => `${x.politicaId}:${x.secao}`)).toEqual(["p1:5. Diretrizes", "p1:6. Registros", "p9:5. Diretrizes"]);
    expect(f[0]).toMatchObject({ codigo: "AHBT-PRO-QUA-001", tipoRotulo: "Procedimento", revisao: 2 });
  });
});

describe("consulta: limitador de uso", () => {
  it("permite até o máximo na janela e libera depois dela; é por pessoa", () => {
    const l = criarLimitador(3, 1000);
    expect([l.permitir("a", 0), l.permitir("a", 100), l.permitir("a", 200), l.permitir("a", 300)]).toEqual([true, true, true, false]);
    expect(l.permitir("b", 300)).toBe(true); // outra pessoa
    expect(l.permitir("a", 1100)).toBe(true); // a primeira saiu da janela
  });
});
