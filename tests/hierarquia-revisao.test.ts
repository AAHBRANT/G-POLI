import { describe, it, expect } from "vitest";
import { TIPOS_DOCUMENTO } from "@/lib/constants";
import { aceitaSuperior, ehOrfao, exigeSuperior, validarSuperior, SUPERIORES_PERMITIDOS } from "@/lib/politica/hierarquia";
import {
  calcularProximaRevisao,
  diasParaRevisao,
  periodicidadeValida,
  situacaoRevisao,
  somarMeses,
  textoRevisao,
} from "@/lib/politica/revisao";

describe("hierarquia: regras de superior", () => {
  it("todo tipo do sistema tem regra definida", () => {
    for (const t of TIPOS_DOCUMENTO) expect(SUPERIORES_PERMITIDOS[t.valor]).toBeDefined();
  });

  it("política e código são de topo", () => {
    expect(aceitaSuperior("politica")).toBe(false);
    expect(aceitaSuperior("codigo")).toBe(false);
  });

  it("procedimento aceita política ou norma; instrução só procedimento; formulário procedimento ou instrução", () => {
    expect(validarSuperior({ id: "a", tipo: "procedimento" }, { id: "b", tipo: "politica" }).ok).toBe(true);
    expect(validarSuperior({ id: "a", tipo: "procedimento" }, { id: "b", tipo: "norma" }).ok).toBe(true);
    expect(validarSuperior({ id: "a", tipo: "instrucao_trabalho" }, { id: "b", tipo: "procedimento" }).ok).toBe(true);
    expect(validarSuperior({ id: "a", tipo: "formulario" }, { id: "b", tipo: "instrucao_trabalho" }).ok).toBe(true);
  });

  it("recusa tipo de superior não permitido", () => {
    expect(validarSuperior({ id: "a", tipo: "instrucao_trabalho" }, { id: "b", tipo: "politica" }).ok).toBe(false);
    expect(validarSuperior({ id: "a", tipo: "procedimento" }, { id: "b", tipo: "formulario" }).ok).toBe(false);
  });

  it("recusa superior em tipo de topo e o documento como superior de si mesmo", () => {
    expect(validarSuperior({ id: "a", tipo: "politica" }, { id: "b", tipo: "politica" }).ok).toBe(false);
    expect(validarSuperior({ id: "a", tipo: "procedimento" }, { id: "a", tipo: "procedimento" }).ok).toBe(false);
  });

  it("a ordem dos tipos não forma ciclo (nenhum tipo é superior, direta ou indiretamente, de si mesmo)", () => {
    const alcanca = (de: string, vistos = new Set<string>()): Set<string> => {
      for (const p of SUPERIORES_PERMITIDOS[de as keyof typeof SUPERIORES_PERMITIDOS]) {
        if (!vistos.has(p)) {
          vistos.add(p);
          alcanca(p, vistos);
        }
      }
      return vistos;
    };
    for (const t of TIPOS_DOCUMENTO) expect(alcanca(t.valor).has(t.valor)).toBe(false);
  });

  it("órfão: tipo que exige superior sem superior", () => {
    expect(exigeSuperior("procedimento")).toBe(true);
    expect(ehOrfao("procedimento", null)).toBe(true);
    expect(ehOrfao("procedimento", "p1")).toBe(false);
    expect(ehOrfao("politica", null)).toBe(false); // política é de topo
    expect(ehOrfao("manual", null)).toBe(false); // superior opcional
  });
});

describe("revisão: prazos", () => {
  it("soma meses preservando o fim do mês", () => {
    expect(somarMeses(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(somarMeses(new Date("2027-12-31T00:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2028-02-29"); // bissexto
    expect(somarMeses(new Date("2026-11-26T00:00:00Z"), 12).toISOString().slice(0, 10)).toBe("2027-11-26");
  });

  it("próxima revisão = base + periodicidade", () => {
    expect(calcularProximaRevisao(new Date("2026-11-26T12:00:00Z"), 12).toISOString().slice(0, 10)).toBe("2027-11-26");
  });

  it("situação: em dia, vence em breve (≤30 dias) e vencida", () => {
    const agora = new Date("2026-11-26T12:00:00Z");
    expect(situacaoRevisao(null, agora)).toBeNull();
    expect(situacaoRevisao(new Date("2027-03-01T12:00:00Z"), agora)).toBe("em_dia");
    expect(situacaoRevisao(new Date("2026-12-20T12:00:00Z"), agora)).toBe("vence_em_breve");
    expect(situacaoRevisao(new Date("2026-12-26T12:00:00Z"), agora)).toBe("vence_em_breve"); // exatamente 30 dias
    expect(situacaoRevisao(new Date("2026-12-27T12:00:00Z"), agora)).toBe("em_dia");
    expect(situacaoRevisao(new Date("2026-11-20T12:00:00Z"), agora)).toBe("vencida");
  });

  it("textos para a tela", () => {
    const agora = new Date("2026-11-26T12:00:00Z");
    expect(textoRevisao(new Date("2026-11-21T12:00:00Z"), agora)).toBe("Revisão vencida há 5 dias");
    expect(textoRevisao(new Date("2026-11-27T12:00:00Z"), agora)).toBe("Revisão em 1 dia");
    expect(textoRevisao(new Date("2026-11-26T12:00:00Z"), agora)).toBe("Revisão vence hoje");
    expect(textoRevisao(null, agora)).toBeNull();
    expect(diasParaRevisao(new Date("2026-12-26T12:00:00Z"), agora)).toBe(30);
  });

  it("periodicidade válida: inteiro de 1 a 60 meses", () => {
    expect(periodicidadeValida(12)).toBe(true);
    expect(periodicidadeValida(0)).toBe(false);
    expect(periodicidadeValida(61)).toBe(false);
    expect(periodicidadeValida(1.5)).toBe(false);
  });
});
