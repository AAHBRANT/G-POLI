import { describe, it, expect } from "vitest";
import {
  filtroVisibilidade,
  podeVerDocumento,
  type Classificacao,
  type DocumentoVisivel,
  type Perfil,
  type UsuarioAtual,
} from "@/lib/auth/rbac";
import { regraAudiencia } from "@/lib/politica/dominio";

// ---------------------------------------------------------------------------
// Avaliador mínimo do subconjunto de filtros do Prisma que filtroVisibilidade
// usa. Serve para provar que o FILTRO (que roda no banco) e o PREDICADO
// (podeVerDocumento, em memória) dão sempre a mesma resposta. Operador
// desconhecido derruba o teste de propósito.
// ---------------------------------------------------------------------------
type Doc = DocumentoVisivel & { id: string };
type Where = Record<string, unknown>;

function avaliar(w: Where, d: Doc): boolean {
  return Object.entries(w).every(([chave, valor]) => {
    switch (chave) {
      case "OR":
        return (valor as Where[]).some((x) => avaliar(x, d));
      case "AND":
        return (valor as Where[]).every((x) => avaliar(x, d));
      case "id":
        return d.id === valor;
      case "estado":
        return d.estado === valor;
      case "classificacao":
        return d.classificacao === valor;
      case "areaId":
      case "consorcioId": {
        const atual = d[chave as "areaId" | "consorcioId"];
        if (valor === null || typeof valor === "string") return atual === valor;
        const lista = (valor as { in: string[] }).in;
        return atual !== null && lista.includes(atual);
      }
      case "audienciaSetores": {
        const v = valor as { none?: unknown; some?: { id: { in: string[] } } };
        if (v.none) return d.audienciaSetorIds.length === 0;
        return d.audienciaSetorIds.some((id) => v.some!.id.in.includes(id));
      }
      case "audienciaUsuarios": {
        const v = valor as { none?: unknown; some?: { id: string } };
        if (v.none) return d.audienciaUsuarioIds.length === 0;
        return d.audienciaUsuarioIds.includes(v.some!.id);
      }
      default:
        throw new Error(`operador não suportado no avaliador: ${chave}`);
    }
  });
}

const user = (perfil: Perfil, setores: string[] = [], consorcios: string[] = [], id: string | null = "u1"): UsuarioAtual => ({
  id, oid: "o", nome: "T", email: "t@aahbrant.com", perfil, setores, consorcios,
});

const doc = (p: Partial<DocumentoVisivel> = {}): Doc => ({
  id: "d1",
  estado: "publicada",
  classificacao: "publico_interno",
  areaId: "s-dono",
  consorcioId: null,
  audienciaSetorIds: [],
  audienciaUsuarioIds: [],
  ...p,
});

describe("visibilidade: filtro do banco == predicado em memória (matriz completa)", () => {
  const usuarios: [string, UsuarioAtual | null][] = [
    ["anônimo", null],
    ["superadmin", user("superadmin")],
    ["admin", user("admin")],
    ["sgi", user("sgi")],
    ["diretoria", user("diretoria")],
    ["gestor do setor dono", user("area", ["s-dono"])],
    ["gestor de outro setor", user("area", ["s-x"])],
    ["gestor sem setor", user("area", [])],
    ["gestor do dono + consórcio c1", user("area", ["s-dono"], ["c1"])],
    ["colaborador do setor dono", user("colaborador", ["s-dono"])],
    ["colaborador de s1", user("colaborador", ["s1"])],
    ["colaborador de s1 + c1", user("colaborador", ["s1"], ["c1"])],
    ["colaborador sem setor", user("colaborador", [])],
    ["colaborador sem id", user("colaborador", ["s1"], [], null)],
  ];
  const estados = ["rascunho", "publicada", "revogada", "em_aprovacao_gestor"];
  const classes: Classificacao[] = ["publico_interno", "restrito", "confidencial"];
  const consorcios: (string | null)[] = [null, "c1", "c2"];
  const audSetores = [[], ["s1"], ["s2"], ["s1", "s2"]];
  const audUsuarios = [[], ["u1"], ["outro"]];

  const docs: Doc[] = [];
  for (const estado of estados)
    for (const classificacao of classes)
      for (const areaId of ["s-dono", "s-outro"])
        for (const consorcioId of consorcios)
          for (const audienciaSetorIds of audSetores)
            for (const audienciaUsuarioIds of audUsuarios)
              docs.push({ id: "d", estado, classificacao, areaId, consorcioId, audienciaSetorIds, audienciaUsuarioIds });

  it("cobre uma matriz grande de casos", () => {
    expect(docs.length).toBeGreaterThan(800);
  });

  for (const [nome, u] of usuarios) {
    it(`concorda para: ${nome}`, () => {
      const filtro = filtroVisibilidade(u);
      for (const d of docs) {
        expect(avaliar(filtro, d), JSON.stringify({ nome, d })).toBe(podeVerDocumento(u, d));
      }
    });
  }
});

describe("visibilidade: a classificação restringe de verdade", () => {
  it("público interno: audiência vazia = todos (comportamento de sempre)", () => {
    expect(podeVerDocumento(user("colaborador", []), doc())).toBe(true);
  });

  it("público interno: com público-alvo, só quem está nele", () => {
    const d = doc({ audienciaSetorIds: ["s1"] });
    expect(podeVerDocumento(user("colaborador", ["s1"]), d)).toBe(true);
    expect(podeVerDocumento(user("colaborador", ["s2"]), d)).toBe(false);
  });

  it("restrito com público-alvo vazio NÃO é para todos: só o setor dono", () => {
    const d = doc({ classificacao: "restrito" });
    expect(podeVerDocumento(user("colaborador", []), d)).toBe(false);
    expect(podeVerDocumento(user("colaborador", ["s1"]), d)).toBe(false);
    expect(podeVerDocumento(user("colaborador", ["s-dono"]), d)).toBe(true);
  });

  it("restrito: setor listado no público-alvo ou nominal também vê", () => {
    const d = doc({ classificacao: "restrito", audienciaSetorIds: ["s1"], audienciaUsuarioIds: ["u9"] });
    expect(podeVerDocumento(user("colaborador", ["s1"]), d)).toBe(true);
    expect(podeVerDocumento(user("colaborador", [], [], "u9"), d)).toBe(true);
    expect(podeVerDocumento(user("colaborador", ["s2"]), d)).toBe(false);
  });

  it("confidencial: setor (nem o dono, nem o listado) não basta — só nominal", () => {
    const d = doc({ classificacao: "confidencial", audienciaSetorIds: ["s1"], audienciaUsuarioIds: ["u9"] });
    expect(podeVerDocumento(user("colaborador", ["s-dono", "s1"]), d)).toBe(false);
    expect(podeVerDocumento(user("colaborador", [], [], "u9"), d)).toBe(true);
  });

  it("gestão vê tudo, inclusive confidencial e rascunho", () => {
    const d = doc({ classificacao: "confidencial", estado: "rascunho" });
    for (const p of ["superadmin", "admin", "sgi", "diretoria"] as Perfil[]) {
      expect(podeVerDocumento(user(p), d)).toBe(true);
    }
  });

  it("gestor de setor vê tudo do próprio setor (qualquer classificação/estado) e nada confidencial/restrito dos outros", () => {
    const gestor = user("area", ["s-dono"]);
    expect(podeVerDocumento(gestor, doc({ classificacao: "confidencial", estado: "rascunho" }))).toBe(true);
    expect(podeVerDocumento(gestor, doc({ classificacao: "restrito", areaId: "s-outro" }))).toBe(false);
    expect(podeVerDocumento(gestor, doc({ classificacao: "confidencial", areaId: "s-outro" }))).toBe(false);
    expect(podeVerDocumento(gestor, doc({ areaId: "s-outro" }))).toBe(true); // público interno de outro setor: segue irrestrito
  });

  it("rascunho/revogado/em aprovação não aparecem para quem não é gestão nem gestor do setor", () => {
    for (const estado of ["rascunho", "revogada", "em_aprovacao_gestor", "em_aprovacao_diretoria"]) {
      expect(podeVerDocumento(user("colaborador", ["s-dono"], [], "u9"), doc({ estado, audienciaUsuarioIds: ["u9"] }))).toBe(false);
    }
  });

  it("consórcio: restrito/confidencial exigem o consórcio E a regra da classificação", () => {
    const rest = doc({ classificacao: "restrito", consorcioId: "c1" });
    expect(podeVerDocumento(user("colaborador", ["s-dono"], ["c1"]), rest)).toBe(true);
    expect(podeVerDocumento(user("colaborador", ["s-dono"], []), rest)).toBe(false); // do setor, mas fora do consórcio
    expect(podeVerDocumento(user("colaborador", [], ["c1"]), rest)).toBe(false); // do consórcio, mas fora do setor
    const conf = doc({ classificacao: "confidencial", consorcioId: "c1", audienciaUsuarioIds: ["u1"] });
    expect(podeVerDocumento(user("colaborador", [], ["c1"]), conf)).toBe(true);
    expect(podeVerDocumento(user("colaborador", [], []), conf)).toBe(false);
  });

  it("sem usuário: nada", () => {
    expect(podeVerDocumento(null, doc())).toBe(false);
  });
});

describe("regraAudiencia (quem recebe aviso/pendência na publicação)", () => {
  it("público interno: vazio = todos; com público-alvo, não", () => {
    expect(regraAudiencia("publico_interno", [], []).todos).toBe(true);
    expect(regraAudiencia("publico_interno", ["s1"], []).todos).toBe(false);
  });
  it("restrito: nunca 'todos'; inclui o setor dono", () => {
    const r = regraAudiencia("restrito", [], []);
    expect(r.todos).toBe(false);
    expect(r.setorDono).toBe(true);
  });
  it("confidencial: só nominais", () => {
    expect(regraAudiencia("confidencial", ["s1"], ["u1"])).toEqual({
      todos: false,
      setoresDoPublicoAlvo: false,
      setorDono: false,
      nominais: true,
    });
  });
});
