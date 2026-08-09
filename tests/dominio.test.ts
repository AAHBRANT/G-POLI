import { describe, it, expect } from "vitest";
import {
  siglaArea,
  proximoSequencial,
  proximoSequencialArea,
  formatarCodigoNormativo,
  ORG_PADRAO,
  editavel,
  comentavel,
  transicao,
  temConteudo,
  montarSnapshot,
  proximoNumeroVersao,
  validarUpload,
  TAMANHO_UPLOAD_MAX,
  planejarAplicacaoIA,
  audienciaVazia,
  unirAudiencia,
  leituraValida,
  TEMPO_MINIMO_LEITURA_MS,
  corpoParaTexto,
  acaoVersao,
  type Estado,
  type AcaoEstado,
  type UsuarioAlvo,
} from "@/lib/politica/dominio";
import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";

// ===========================================================================
// Código normativo
// ===========================================================================
describe("Código normativo", () => {
  it("sigla: área com nome oficial usa a sigla da tabela do SGI (2026-07-30)", () => {
    expect(siglaArea("Recursos Humanos")).toBe("RH");
    expect(siglaArea("Tecnologia da Informação")).toBe("TI");
    // "Financeiro" é absorvido por "Administrativo e Financeiro" (ADM) na
    // tabela oficial — deixou de ser sigla própria.
    expect(siglaArea("Financeiro")).toBe("ADM");
    expect(siglaArea("financeiro")).toBe("ADM"); // normalizado (minúsculo bate igual)
  });

  it("sigla: multi-palavra fora da tabela oficial vira iniciais (até 4)", () => {
    expect(siglaArea("Tecnologia da Informação Corporativa")).toBe("TDIC");
  });

  it("sigla: palavra única fora da tabela oficial vira 3 letras", () => {
    expect(siglaArea("Logística")).toBe("LOG");
  });

  it("sigla: remove acentos e pontuação, sobe caixa (fallback)", () => {
    expect(siglaArea("Produção")).toBe("PRO");
    expect(siglaArea("Jurídico & Compliance")).toBe("JC");
  });

  it("sigla: vazio cai no fallback GER", () => {
    expect(siglaArea("   ")).toBe("GER");
  });

  it("sequencial (por prefixo fixo): começa em 1 quando não há códigos", () => {
    expect(proximoSequencial("POL-RH-", [])).toBe(1);
  });

  it("sequencial (por prefixo fixo): usa o maior existente + 1 (ignora buracos e inválidos)", () => {
    expect(proximoSequencial("POL-RH-", ["POL-RH-001", "POL-RH-003", "POL-RH-002"])).toBe(4);
    expect(proximoSequencial("POL-RH-", ["POL-RH-abc", null, undefined, "POL-RH-005"])).toBe(6);
  });

  it("sequencial por área: comum a todos os TDs (regra oficial — SEQ não é por tipo)", () => {
    expect(proximoSequencialArea([])).toBe(1);
    expect(
      proximoSequencialArea(["AHBT-POL-ENG-001", "AHBT-PRO-ENG-002", "AHBT-IT-ENG-003"]),
    ).toBe(4);
    expect(proximoSequencialArea(["AHBT-POL-ENG-abc", null, undefined, "AHBT-MAN-ENG-005"])).toBe(6);
  });

  it("formata no padrão oficial AHBT-<TD>-<SIGLA>-NNN com zero-pad (POL é o TD default)", () => {
    expect(formatarCodigoNormativo("RH", 1)).toBe(`${ORG_PADRAO}-POL-RH-001`);
    expect(formatarCodigoNormativo("TI", 42)).toBe(`${ORG_PADRAO}-POL-TI-042`);
  });

  it("v3: aceita prefixo de outros tipos de documento", () => {
    expect(formatarCodigoNormativo("RH", 1, "PRO")).toBe(`${ORG_PADRAO}-PRO-RH-001`);
    expect(formatarCodigoNormativo("TI", 7, "IT")).toBe(`${ORG_PADRAO}-IT-TI-007`);
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
    // Sprint 4/5/6: mensagem mudou pra cobrir os dois caminhos válidos de
    // publicar (rascunho direto = modelo A/legado; em_aprovacao_diretoria =
    // modelo B/novo) — só "publicada" continua inválido pros dois.
    expect(transicao("publicada", "publicar")).toEqual({
      ok: false,
      erro: "Só é possível publicar uma política em rascunho ou em aprovação da Diretoria.",
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
    expect(editavel("em_aprovacao_gestor")).toBe(false);
    expect(editavel("em_aprovacao_diretoria")).toBe(false);
    expect(editavel("publicada")).toBe(false);
    expect(editavel("revogada")).toBe(false);
  });

  it("comentável (Sprint 3+4/5/6): rascunho e as duas etapas de aprovação; não publicada/revogada", () => {
    expect(comentavel("rascunho")).toBe(true);
    expect(comentavel("em_aprovacao_gestor")).toBe(true);
    expect(comentavel("em_aprovacao_diretoria")).toBe(true);
    expect(comentavel("publicada")).toBe(false);
    expect(comentavel("revogada")).toBe(false);
  });
});

describe("Fluxo de aprovação Gestor → Diretoria (Sprint 4/5/6)", () => {
  it("cadeia completa: rascunho → gestor → diretoria → publicada", () => {
    expect(transicao("rascunho", "enviar_aprovacao")).toEqual({ ok: true, estado: "em_aprovacao_gestor" });
    expect(transicao("em_aprovacao_gestor", "aprovar_gestor")).toEqual({ ok: true, estado: "em_aprovacao_diretoria" });
    expect(transicao("em_aprovacao_diretoria", "publicar")).toEqual({ ok: true, estado: "publicada" });
  });

  it("rejeição em qualquer etapa volta pra rascunho (não é um estado próprio)", () => {
    expect(transicao("em_aprovacao_gestor", "rejeitar_gestor")).toEqual({ ok: true, estado: "rascunho" });
    expect(transicao("em_aprovacao_diretoria", "rejeitar_diretoria")).toEqual({ ok: true, estado: "rascunho" });
  });

  it("retirar da aprovação volta pra rascunho, nas duas etapas", () => {
    expect(transicao("em_aprovacao_gestor", "retirar_aprovacao")).toEqual({ ok: true, estado: "rascunho" });
    expect(transicao("em_aprovacao_diretoria", "retirar_aprovacao")).toEqual({ ok: true, estado: "rascunho" });
  });

  it("modelo A (legado) continua funcionando: Diretoria publica direto de rascunho, pulando o Gestor", () => {
    expect(transicao("rascunho", "publicar")).toEqual({ ok: true, estado: "publicada" });
  });

  it("ações fora de ordem são rejeitadas", () => {
    expect(transicao("rascunho", "aprovar_gestor").ok).toBe(false);
    expect(transicao("rascunho", "rejeitar_gestor").ok).toBe(false);
    expect(transicao("em_aprovacao_gestor", "rejeitar_diretoria").ok).toBe(false);
    expect(transicao("em_aprovacao_diretoria", "rejeitar_gestor").ok).toBe(false);
    expect(transicao("em_aprovacao_diretoria", "enviar_aprovacao").ok).toBe(false);
    expect(transicao("publicada", "retirar_aprovacao").ok).toBe(false);
    expect(transicao("rascunho", "retirar_aprovacao").ok).toBe(false);
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
  const ESTADOS: Estado[] = ["rascunho", "em_aprovacao_gestor", "em_aprovacao_diretoria", "publicada", "revogada"];
  const ACOES: AcaoEstado[] = [
    "enviar_aprovacao",
    "aprovar_gestor",
    "rejeitar_gestor",
    "publicar",
    "rejeitar_diretoria",
    "retirar_aprovacao",
    "revogar",
    "reabrir",
  ];

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
    expect(a).toMatch(/^AHBT-POL-[A-Z0-9]+-\d{3}$/);
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

describe("leituraValida (ciência de leitura — trava de tempo mínimo)", () => {
  it("rejeita confirmação antes do tempo mínimo desde a abertura", () => {
    const abertura = new Date("2026-01-01T10:00:00.000Z");
    const agora = new Date(abertura.getTime() + TEMPO_MINIMO_LEITURA_MS - 1);
    expect(leituraValida(abertura.toISOString(), agora)).toBe(false);
  });

  it("aceita confirmação exatamente no tempo mínimo ou depois", () => {
    const abertura = new Date("2026-01-01T10:00:00.000Z");
    const agora = new Date(abertura.getTime() + TEMPO_MINIMO_LEITURA_MS);
    expect(leituraValida(abertura.toISOString(), agora)).toBe(true);
  });

  it("rejeita timestamp de abertura inválido", () => {
    expect(leituraValida("nao-e-uma-data", new Date())).toBe(false);
  });
});

// ===========================================================================
// Geração do documento oficial (.docx)
// ===========================================================================
describe("corpoParaTexto (achatamento de seção-tabela para texto)", () => {
  it("seção de texto: devolve o corpo como está", () => {
    expect(corpoParaTexto({ tipo: "texto", corpo: "Um parágrafo qualquer." })).toBe(
      "Um parágrafo qualquer.",
    );
  });

  it("seção de tabela: cabeçalho + linhas, células separadas por ' | '", () => {
    const resultado = corpoParaTexto({
      tipo: "tabela",
      corpo: "",
      colunas: ["Termo", "Definição"],
      linhas: [
        ["Ativo", "Bem de valor econômico."],
        ["Passivo", "Obrigação a pagar."],
      ],
    });
    expect(resultado).toBe(
      "Termo | Definição\nAtivo | Bem de valor econômico.\nPassivo | Obrigação a pagar.",
    );
  });

  it("seção de tabela sem colunas definidas: só as linhas", () => {
    const resultado = corpoParaTexto({ tipo: "tabela", corpo: "", colunas: null, linhas: [["a", "b"]] });
    expect(resultado).toBe("a | b");
  });

  it("seção de tabela vazia: string vazia", () => {
    expect(corpoParaTexto({ tipo: "tabela", corpo: "", colunas: null, linhas: null })).toBe("");
  });
});

// ===========================================================================
// Ação disponível por versão (v3: "Ver" em vez de "Baixar")
// ===========================================================================
describe("acaoVersao (ver docs/superpowers/specs/2026-08-02-versao-substituida-ver-nao-baixar-design.md)", () => {
  it("sem documento → nenhuma", () => {
    expect(acaoVersao({ temDocumento: false, oficial: false, estado: "ativa", temSnapshot: false })).toBe(
      "nenhuma",
    );
  });

  it("anexo manual (oficial=false), estado ativa → baixar", () => {
    expect(acaoVersao({ temDocumento: true, oficial: false, estado: "ativa", temSnapshot: false })).toBe(
      "baixar",
    );
  });

  it("anexo manual (oficial=false), estado substituida → baixar (anexo NUNCA vira ver)", () => {
    expect(
      acaoVersao({ temDocumento: true, oficial: false, estado: "substituida", temSnapshot: true }),
    ).toBe("baixar");
  });

  it("oficial=true, estado ativa → baixar", () => {
    expect(acaoVersao({ temDocumento: true, oficial: true, estado: "ativa", temSnapshot: false })).toBe(
      "baixar",
    );
  });

  it("oficial=true, estado substituida, temSnapshot=true → ver", () => {
    expect(
      acaoVersao({ temDocumento: true, oficial: true, estado: "substituida", temSnapshot: true }),
    ).toBe("ver");
  });

  it("oficial=true, estado substituida, temSnapshot=false → nenhuma", () => {
    expect(
      acaoVersao({ temDocumento: true, oficial: true, estado: "substituida", temSnapshot: false }),
    ).toBe("nenhuma");
  });
});
