import { describe, it, expect } from "vitest";
import {
  siglaArea,
  proximoSequencial,
  formatarCodigoNormativo,
  editavel,
  transicao,
  temConteudo,
  montarSnapshot,
  proximoNumeroVersao,
  validarUpload,
  TAMANHO_UPLOAD_MAX,
  planejarAplicacaoIA,
  audienciaVazia,
  unirAudiencia,
  type Estado,
  type AcaoEstado,
  type UsuarioAlvo,
} from "@/lib/dominio";
import { ESQUELETO_PADRAO } from "@/lib/esqueleto";

// ===========================================================================
// Código normativo
// ===========================================================================
describe("Código normativo", () => {
  it("sigla: multi-palavra vira iniciais (até 4)", () => {
    expect(siglaArea("Recursos Humanos")).toBe("RH");
    expect(siglaArea("Tecnologia da Informação Corporativa")).toBe("TDIC");
  });

  it("sigla: palavra única vira 3 letras", () => {
    expect(siglaArea("Financeiro")).toBe("FIN");
    expect(siglaArea("TI")).toBe("TI");
  });

  it("sigla: remove acentos e pontuação, sobe caixa", () => {
    expect(siglaArea("Produção")).toBe("PRO");
    expect(siglaArea("Jurídico & Compliance")).toBe("JC");
  });

  it("sigla: vazio cai no fallback GER", () => {
    expect(siglaArea("   ")).toBe("GER");
  });

  it("sequencial: começa em 1 quando não há códigos", () => {
    expect(proximoSequencial("POL-RH-", [])).toBe(1);
  });

  it("sequencial: usa o maior existente + 1 (ignora buracos e inválidos)", () => {
    expect(proximoSequencial("POL-RH-", ["POL-RH-001", "POL-RH-003", "POL-RH-002"])).toBe(4);
    expect(proximoSequencial("POL-RH-", ["POL-RH-abc", null, undefined, "POL-RH-005"])).toBe(6);
  });

  it("formata no padrão POL-<SIGLA>-NNN com zero-pad (POL é o default, sem 3º argumento)", () => {
    expect(formatarCodigoNormativo("RH", 1)).toBe("POL-RH-001");
    expect(formatarCodigoNormativo("TI", 42)).toBe("POL-TI-042");
  });

  it("v3: aceita prefixo de outros tipos de documento", () => {
    expect(formatarCodigoNormativo("RH", 1, "NOR")).toBe("NOR-RH-001");
    expect(formatarCodigoNormativo("TI", 7, "PRO")).toBe("PRO-TI-007");
  });
});

// ===========================================================================
// Máquina de estados
// ===========================================================================
describe("Máquina de estados", () => {
  it("transições permitidas", () => {
    expect(transicao("rascunho", "publicar")).toEqual({ ok: true, estado: "publicada" });
    expect(transicao("publicada", "revogar")).toEqual({ ok: true, estado: "revogada" });
    expect(transicao("publicada", "reabrir")).toEqual({ ok: true, estado: "rascunho" });
    expect(transicao("revogada", "reabrir")).toEqual({ ok: true, estado: "rascunho" });
  });

  it("transições proibidas retornam erro (mensagem exata)", () => {
    expect(transicao("publicada", "publicar")).toEqual({
      ok: false,
      erro: "Só é possível publicar uma política em rascunho.",
    });
    expect(transicao("rascunho", "revogar")).toEqual({
      ok: false,
      erro: "Só é possível revogar uma política publicada.",
    });
    expect(transicao("revogada", "revogar")).toEqual({
      ok: false,
      erro: "Só é possível revogar uma política publicada.",
    });
    expect(transicao("rascunho", "reabrir")).toEqual({
      ok: false,
      erro: "A política já está em rascunho.",
    });
  });

  it("edição: só rascunho é editável", () => {
    expect(editavel("rascunho")).toBe(true);
    expect(editavel("publicada")).toBe(false);
    expect(editavel("revogada")).toBe(false);
  });
});

// ===========================================================================
// Publicação
// ===========================================================================
describe("Publicação", () => {
  it("texto: conteúdo só conta se corpo não-vazio", () => {
    expect(temConteudo([{ tipo: "texto", corpo: "  ", linhas: null }])).toBe(false);
    expect(temConteudo([{ tipo: "texto", corpo: "algo", linhas: null }])).toBe(true);
  });

  it("tabela: conteúdo só conta com ao menos uma linha", () => {
    expect(temConteudo([{ tipo: "tabela", corpo: "", linhas: [] }])).toBe(false);
    expect(temConteudo([{ tipo: "tabela", corpo: "", linhas: [["a", "b"]] }])).toBe(true);
  });

  it("nenhuma seção preenchida = sem conteúdo", () => {
    expect(
      temConteudo([
        { tipo: "texto", corpo: "", linhas: null },
        { tipo: "tabela", corpo: "", linhas: [] },
      ]),
    ).toBe(false);
  });
});

// ===========================================================================
// Snapshot
// ===========================================================================
describe("Snapshot", () => {
  const secoes = [
    { ordem: 2, codigo: "2", titulo: "B", tipo: "texto", corpo: "b", colunas: undefined, linhas: undefined },
    { ordem: 1, codigo: "1", titulo: "A", tipo: "texto", corpo: "a", colunas: undefined, linhas: undefined },
  ];

  it("ordena por ordem e preserva os campos oficiais", () => {
    const snap = montarSnapshot(secoes);
    expect(snap.map((s) => s.codigo)).toEqual(["1", "2"]);
    expect(snap[0]).toEqual({ codigo: "1", titulo: "A", tipo: "texto", corpo: "a", colunas: null, linhas: null });
  });

  it("não muta o array de entrada", () => {
    const entrada = [...secoes];
    montarSnapshot(entrada);
    expect(entrada[0].ordem).toBe(2); // ordem original preservada
  });

  it("colunas/linhas ausentes viram null", () => {
    const snap = montarSnapshot([
      { ordem: 1, codigo: "4", titulo: "Def", tipo: "tabela", corpo: "", colunas: ["T", "D"], linhas: [["x", "y"]] },
    ]);
    expect(snap[0].colunas).toEqual(["T", "D"]);
    expect(snap[0].linhas).toEqual([["x", "y"]]);
  });
});

// ===========================================================================
// Versionamento
// ===========================================================================
describe("Versionamento", () => {
  it("próximo número = total + 1 (sequência começa em 1)", () => {
    expect(proximoNumeroVersao(0)).toBe(1);
    expect(proximoNumeroVersao(3)).toBe(4);
  });

  it("aceita extensões permitidas dentro do limite", () => {
    expect(validarUpload("norma.pdf", 1000)).toEqual({ ok: true });
    expect(validarUpload("planilha.XLSX", 1000)).toEqual({ ok: true }); // case-insensitive
  });

  it("rejeita acima de 25 MB (mensagem exata)", () => {
    expect(validarUpload("norma.pdf", TAMANHO_UPLOAD_MAX + 1)).toEqual({
      ok: false,
      erro: "Arquivo acima de 25 MB.",
    });
  });

  it("rejeita extensão fora da lista (mensagem exata)", () => {
    expect(validarUpload("malware.exe", 10)).toEqual({
      ok: false,
      erro: "Tipo não permitido (.exe).",
    });
    expect(validarUpload("semext", 10)).toEqual({
      ok: false,
      erro: "Tipo não permitido (sem extensão).",
    });
  });
});

// ===========================================================================
// Esqueleto
// ===========================================================================
// A estrutura vem do Manual de Padronização Documental do SGI, capítulo 16.1
// (Política). Se estes testes falharem, o app voltou a gerar política fora do
// padrão corporativo — não "conserte" o teste sem conferir o Manual.
describe("Esqueleto normativo de Política (Manual SGI 16.1)", () => {
  it("tem exatamente as 7 seções do capítulo 16.1, na ordem do Manual", () => {
    expect(ESQUELETO_PADRAO.map((s) => s.titulo)).toEqual([
      "Objetivo",
      "Abrangência",
      "Princípios",
      "Diretrizes",
      "Responsabilidades",
      "Compromissos",
      "Disposições Gerais",
    ]);
  });

  it("ordem é sequencial 1..7 e o código acompanha a ordem", () => {
    expect(ESQUELETO_PADRAO.map((s) => s.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ESQUELETO_PADRAO.map((s) => s.codigo)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("não traz seções que o Manual reserva ao Procedimento (16.2)", () => {
    const titulos = ESQUELETO_PADRAO.map((s) => s.titulo);
    expect(titulos).not.toContain("Definições");
    expect(titulos).not.toContain("Anexos");
    expect(titulos).not.toContain("Campo de Aplicação");
    expect(titulos).not.toContain("Referências");
    expect(titulos).not.toContain("Registros");
    expect(titulos).not.toContain("Indicadores");
  });

  it("Responsabilidades é a única tabela, e tabela sem coluna não passa", () => {
    const tabelas = ESQUELETO_PADRAO.filter((s) => s.tipo === "tabela");
    expect(tabelas.map((s) => s.titulo)).toEqual(["Responsabilidades"]);
    for (const t of tabelas) {
      expect(Array.isArray(t.colunas) && t.colunas!.length > 0).toBe(true);
    }
  });

  it("toda seção tem dica de preenchimento", () => {
    for (const s of ESQUELETO_PADRAO) {
      expect(s.dica && s.dica.length > 10).toBeTruthy();
    }
  });
});

// ===========================================================================
// Invariantes — regras que nunca podem quebrar
// ===========================================================================
describe("Invariantes do domínio", () => {
  const ESTADOS: Estado[] = ["rascunho", "publicada", "revogada"];
  const ACOES: AcaoEstado[] = ["publicar", "revogar", "reabrir"];

  it("toda transição bem-sucedida termina em estado válido", () => {
    for (const e of ESTADOS) {
      for (const a of ACOES) {
        const r = transicao(e, a);
        if (r.ok) expect(ESTADOS).toContain(r.estado);
      }
    }
  });

  it("somente rascunho é editável (para todo estado)", () => {
    for (const e of ESTADOS) {
      expect(editavel(e)).toBe(e === "rascunho");
    }
  });

  it("publicar exige conteúdo válido: transição ok não implica publicável sem conteúdo", () => {
    // A transição permite (rascunho→publicar), mas sem conteúdo não se publica.
    expect(transicao("rascunho", "publicar").ok).toBe(true);
    expect(temConteudo([{ tipo: "texto", corpo: "", linhas: null }])).toBe(false);
  });

  it("toda publicação gera exatamente um snapshot (1 entrada por seção, ordenado)", () => {
    const secoes = ESQUELETO_PADRAO.map((s, i) => ({
      ordem: s.ordem,
      codigo: s.codigo,
      titulo: s.titulo,
      tipo: s.tipo,
      corpo: i === 0 ? "conteúdo" : "",
      colunas: s.colunas,
      linhas: undefined,
    }));
    const snap = montarSnapshot(secoes);
    expect(snap).toHaveLength(secoes.length);
    // Derivado do esqueleto, não fixo: a invariante é "um snapshot por seção, na
    // ordem", e ela não depende de quantas seções o Manual define.
    expect(snap.map((s) => s.codigo)).toEqual(ESQUELETO_PADRAO.map((s) => s.codigo));
  });

  it("número de versão é sempre crescente e único por sequência", () => {
    const numeros = [0, 1, 2, 3].map(proximoNumeroVersao);
    expect(numeros).toEqual([1, 2, 3, 4]);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("código normativo é determinístico (mesma entrada → mesmo código)", () => {
    const a = formatarCodigoNormativo(siglaArea("Recursos Humanos"), proximoSequencial("POL-RH-", ["POL-RH-001"]));
    const b = formatarCodigoNormativo(siglaArea("Recursos Humanos"), proximoSequencial("POL-RH-", ["POL-RH-001"]));
    expect(a).toBe(b);
    expect(a).toMatch(/^POL-[A-Z0-9]+-\d{3}$/);
  });
});

// ===========================================================================
// IA — plano de aplicação (base do tudo-ou-nada)
// ===========================================================================
describe("IA — planejarAplicacaoIA", () => {
  const secoes = [
    { id: "s1", codigo: "1", tipo: "texto" },
    { id: "s4", codigo: "4", tipo: "tabela" },
  ];

  it("texto vira update de corpo; tabela vira update de linhas", () => {
    const plano = planejarAplicacaoIA(secoes, [
      { codigo: "1", corpo: "novo objetivo" },
      { codigo: "4", linhas: [["Termo", "Definição"]] },
    ]);
    expect(plano).toEqual([
      { id: "s1", data: { corpo: "novo objetivo" } },
      { id: "s4", data: { linhas: [["Termo", "Definição"]] } },
    ]);
  });

  it("ignora rascunho de seção inexistente", () => {
    const plano = planejarAplicacaoIA(secoes, [{ codigo: "9", corpo: "x" }]);
    expect(plano).toEqual([]);
  });

  it("ignora tipo incompatível (tabela sem linhas array; texto sem corpo string)", () => {
    const plano = planejarAplicacaoIA(secoes, [
      { codigo: "4", corpo: "texto numa tabela" }, // tabela mas sem linhas → ignora
      { codigo: "1", linhas: [["x"]] }, // texto mas sem corpo → ignora
    ]);
    expect(plano).toEqual([]);
  });

  it("aceita codigo numérico (coerção para string)", () => {
    const plano = planejarAplicacaoIA(secoes, [{ codigo: 1, corpo: "ok" }]);
    expect(plano).toEqual([{ id: "s1", data: { corpo: "ok" } }]);
  });

  it("plano é a base do tudo-ou-nada: N seções válidas → N updates (aplicados em 1 transação)", () => {
    const plano = planejarAplicacaoIA(secoes, [
      { codigo: "1", corpo: "a" },
      { codigo: "4", linhas: [["b"]] },
    ]);
    expect(plano).toHaveLength(2);
  });
});

// ===========================================================================
// Público-alvo da notificação (v3)
// ===========================================================================
describe("Público-alvo da notificação", () => {
  const u = (id: string, oid: string | null = `oid-${id}`): UsuarioAlvo => ({
    id,
    oid,
    nome: `Nome ${id}`,
    email: `${id}@aahbrant.com`,
  });

  it("sem setor e sem usuário selecionado = audiência vazia (dispara 'todos')", () => {
    expect(audienciaVazia([], [])).toBe(true);
  });

  it("qualquer seleção (setor ou usuário) já não é vazia", () => {
    expect(audienciaVazia(["s1"], [])).toBe(false);
    expect(audienciaVazia([], ["u1"])).toBe(false);
  });

  it("união simples sem sobreposição soma os dois grupos", () => {
    const r = unirAudiencia([u("a"), u("b")], [u("c")]);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("a mesma pessoa pelos dois caminhos (setor + individual) conta uma vez só", () => {
    const r = unirAudiencia([u("a"), u("b")], [u("b")]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("audiência vazia de fato (nenhum setor tem membro, nenhum individual) devolve lista vazia", () => {
    expect(unirAudiencia([], [])).toEqual([]);
  });
});
