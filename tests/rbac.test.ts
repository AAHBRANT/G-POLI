import { describe, it, expect } from "vitest";
import {
  regraAcesso,
  podeCriarPolitica,
  podeEditarConteudo,
  podeEditarSecao,
  podeEnviarParaAprovacao,
  podeAprovarGestor,
  podeAprovarDiretoria,
  podeRetirarDaAprovacao,
  podePublicar,
  podeRevogar,
  podeAdministrar,
  podeGerirSetores,
  podeGerirConsorcios,
  filtroVisibilidade,
  type Perfil,
  type UsuarioAtual,
} from "@/lib/auth/rbac";

const u = (perfil: Perfil, setores: string[] = [], consorcios: string[] = []): UsuarioAtual => ({
  id: "1", oid: "o", nome: "T", email: "t@aahbrant.com", perfil, setores, consorcios,
});
const ADMINS = ["chefe@aahbrant.com"];
const DOM = ["aahbrant.com"];

describe("regraAcesso (P1)", () => {
  it("admin de bootstrap sempre entra", () => {
    expect(regraAcesso({ email: "chefe@aahbrant.com", adminEmails: ADMINS, acessoAberto: false, dominios: DOM, registro: null })).toBe(true);
  });
  it("cadastrado ativo entra; inativo é bloqueado (mesmo aberto)", () => {
    expect(regraAcesso({ email: "a@aahbrant.com", adminEmails: ADMINS, acessoAberto: true, dominios: DOM, registro: { ativo: true } })).toBe(true);
    expect(regraAcesso({ email: "a@aahbrant.com", adminEmails: ADMINS, acessoAberto: true, dominios: DOM, registro: { ativo: false } })).toBe(false);
  });
  it("novo do domínio entra só no modo aberto", () => {
    expect(regraAcesso({ email: "novo@aahbrant.com", adminEmails: ADMINS, acessoAberto: true, dominios: DOM, registro: null })).toBe(true);
    expect(regraAcesso({ email: "novo@aahbrant.com", adminEmails: ADMINS, acessoAberto: false, dominios: DOM, registro: null })).toBe(false);
  });
  it("fora do domínio nunca entra como novo", () => {
    expect(regraAcesso({ email: "x@gmail.com", adminEmails: ADMINS, acessoAberto: true, dominios: DOM, registro: null })).toBe(false);
  });
  it("email vazio = sem acesso", () => {
    expect(regraAcesso({ email: "", adminEmails: ADMINS, acessoAberto: true, dominios: DOM, registro: null })).toBe(false);
  });
});

describe("podeCriarPolitica (P1)", () => {
  it("sgi/admin/super sim; area/diretoria/colaborador não", () => {
    expect(podeCriarPolitica(u("sgi"))).toBe(true);
    expect(podeCriarPolitica(u("admin"))).toBe(true);
    expect(podeCriarPolitica(u("superadmin"))).toBe(true);
    expect(podeCriarPolitica(u("area", ["s1"]))).toBe(false);
    expect(podeCriarPolitica(u("diretoria"))).toBe(false);
    expect(podeCriarPolitica(u("colaborador"))).toBe(false);
    expect(podeCriarPolitica(null)).toBe(false);
  });
});

describe("podeEditarConteudo (P1)", () => {
  const rascunhoS1 = { areaId: "s1", estado: "rascunho" };
  it("publicada trava todos", () => {
    expect(podeEditarConteudo(u("sgi"), { areaId: "s1", estado: "publicada" })).toBe(false);
  });
  it("sgi edita qualquer setor em rascunho", () => {
    expect(podeEditarConteudo(u("sgi"), rascunhoS1)).toBe(true);
  });
  it("gestor de setor edita só o próprio setor", () => {
    expect(podeEditarConteudo(u("area", ["s1"]), rascunhoS1)).toBe(true);
    expect(podeEditarConteudo(u("area", ["s2"]), rascunhoS1)).toBe(false);
  });
  it("colaborador não edita", () => {
    expect(podeEditarConteudo(u("colaborador"), rascunhoS1)).toBe(false);
  });
});

describe("podeEditarSecao (P1) — abertaAArea", () => {
  const p = { areaId: "s1", estado: "rascunho" };
  it("gestor do setor só edita seção liberada", () => {
    expect(podeEditarSecao(u("area", ["s1"]), p, { abertaAArea: true })).toBe(true);
    expect(podeEditarSecao(u("area", ["s1"]), p, { abertaAArea: false })).toBe(false);
  });
  it("sgi edita mesmo seção não liberada", () => {
    expect(podeEditarSecao(u("sgi"), p, { abertaAArea: false })).toBe(true);
  });
});

describe("podeEnviarParaAprovacao (Sprint 4/5/6)", () => {
  it("é alias de podeEditarConteudo — mesma régua exata", () => {
    const rascunhoS1 = { areaId: "s1", estado: "rascunho" };
    expect(podeEnviarParaAprovacao(u("sgi"), rascunhoS1)).toBe(podeEditarConteudo(u("sgi"), rascunhoS1));
    expect(podeEnviarParaAprovacao(u("area", ["s2"]), rascunhoS1)).toBe(false);
    expect(podeEnviarParaAprovacao(u("area", ["s1"]), rascunhoS1)).toBe(true);
  });
});

describe("podeAprovarGestor (Sprint 5)", () => {
  const p = { areaId: "s1" };
  it("gestor do setor dono aprova", () => {
    expect(podeAprovarGestor(u("area", ["s1"]), p)).toBe(true);
  });
  it("gestor de outro setor não aprova", () => {
    expect(podeAprovarGestor(u("area", ["s2"]), p)).toBe(false);
  });
  it("SGI e Diretoria não são 'o Gestor' — não aprovam nesta etapa", () => {
    expect(podeAprovarGestor(u("sgi"), p)).toBe(false);
    expect(podeAprovarGestor(u("diretoria"), p)).toBe(false);
  });
  it("admin/super sempre aprovam (override administrativo)", () => {
    expect(podeAprovarGestor(u("admin"), p)).toBe(true);
    expect(podeAprovarGestor(u("superadmin"), p)).toBe(true);
  });
});

describe("podeAprovarDiretoria (Sprint 6) — alias de podePublicar", () => {
  it("mesma régua exata de podePublicar", () => {
    for (const perfil of ["diretoria", "admin", "superadmin", "sgi", "area", "colaborador"] as Perfil[]) {
      expect(podeAprovarDiretoria(u(perfil))).toBe(podePublicar(u(perfil)));
    }
  });
});

describe("podeRetirarDaAprovacao (Sprint 4/5/6)", () => {
  const p = { areaId: "s1" };
  it("SGI/admin/super retiram qualquer setor", () => {
    for (const perfil of ["sgi", "admin", "superadmin"] as Perfil[]) {
      expect(podeRetirarDaAprovacao(u(perfil), p)).toBe(true);
    }
  });
  it("área retira só o próprio setor", () => {
    expect(podeRetirarDaAprovacao(u("area", ["s1"]), p)).toBe(true);
    expect(podeRetirarDaAprovacao(u("area", ["s2"]), p)).toBe(false);
  });
  it("diretoria e colaborador não retiram (não são donos do conteúdo)", () => {
    expect(podeRetirarDaAprovacao(u("diretoria"), p)).toBe(false);
    expect(podeRetirarDaAprovacao(u("colaborador"), p)).toBe(false);
  });
  it("sem usuário, nunca retira", () => {
    expect(podeRetirarDaAprovacao(null, p)).toBe(false);
  });
});

describe("publicar/revogar (P1)", () => {
  it("diretoria/admin/super sim; sgi/area/colaborador não", () => {
    for (const perfil of ["diretoria", "admin", "superadmin"] as Perfil[]) {
      expect(podePublicar(u(perfil))).toBe(true);
      expect(podeRevogar(u(perfil))).toBe(true);
    }
    for (const perfil of ["sgi", "area", "colaborador"] as Perfil[]) {
      expect(podePublicar(u(perfil))).toBe(false);
      expect(podeRevogar(u(perfil))).toBe(false);
    }
  });
});

describe("administração e visibilidade", () => {
  it("podeAdministrar = super/admin/area; podeGerirSetores = só super", () => {
    expect(podeAdministrar(u("area", ["s1"]))).toBe(true);
    expect(podeAdministrar(u("colaborador"))).toBe(false);
    expect(podeGerirSetores(u("admin"))).toBe(false);
    expect(podeGerirSetores(u("superadmin"))).toBe(true);
  });

  it("podeGerirConsorcios: só super", () => {
    expect(podeGerirConsorcios(u("admin"))).toBe(false);
    expect(podeGerirConsorcios(u("superadmin"))).toBe(true);
  });

  it("filtroVisibilidade: gestor vê tudo; area com setor vê publicada+setores (irrestrito por audiência)", () => {
    expect(filtroVisibilidade(u("admin"))).toEqual({});
    expect(filtroVisibilidade(u("area", ["s1", "s2"]))).toEqual({
      OR: [
        { estado: "publicada", consorcioId: null },
        { estado: "publicada", consorcioId: { in: [] } },
        { areaId: { in: ["s1", "s2"] } },
      ],
    });
  });

  it("filtroVisibilidade: area com setor mas fora do consórcio do documento não vê (exceto se for do próprio setor)", () => {
    expect(filtroVisibilidade(u("area", ["s1"]))).toEqual({
      OR: [
        { estado: "publicada", consorcioId: null },
        { estado: "publicada", consorcioId: { in: [] } },
        { areaId: { in: ["s1"] } },
      ],
    });
  });

  it("filtroVisibilidade: area vinculada ao consórcio também vê publicada daquele consórcio", () => {
    expect(filtroVisibilidade(u("area", ["s1"], ["c1"]))).toEqual({
      OR: [
        { estado: "publicada", consorcioId: null },
        { estado: "publicada", consorcioId: { in: ["c1"] } },
        { areaId: { in: ["s1"] } },
      ],
    });
  });

  it("colaborador: só publicada DENTRO do público-alvo (setor OU individual OU audiência vazia)", () => {
    const semPublicoAlvo = { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } };
    // Sem setor: só a checagem "sem público-alvo" (todos) + "eu individualmente".
    expect(filtroVisibilidade(u("colaborador"))).toEqual({
      OR: [
        { estado: "publicada", consorcioId: null, OR: [semPublicoAlvo, { audienciaUsuarios: { some: { id: "1" } } }] },
        { estado: "publicada", consorcioId: { in: [] } },
      ],
    });
    // Com setor: soma a checagem por setor também.
    expect(filtroVisibilidade(u("colaborador", ["s1"]))).toEqual({
      OR: [
        {
          estado: "publicada",
          consorcioId: null,
          OR: [
            semPublicoAlvo,
            { audienciaSetores: { some: { id: { in: ["s1"] } } } },
            { audienciaUsuarios: { some: { id: "1" } } },
          ],
        },
        { estado: "publicada", consorcioId: { in: [] } },
      ],
    });
  });

  it("colaborador sem consórcio: só publicada sem consórcio, dentro do público-alvo de sempre", () => {
    const semPublicoAlvo = { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } };
    expect(filtroVisibilidade(u("colaborador"))).toEqual({
      OR: [
        {
          estado: "publicada",
          consorcioId: null,
          OR: [semPublicoAlvo, { audienciaUsuarios: { some: { id: "1" } } }],
        },
        { estado: "publicada", consorcioId: { in: [] } },
      ],
    });
  });

  it("colaborador vinculado ao consórcio vê publicada daquele consórcio, sem checar público-alvo", () => {
    expect(filtroVisibilidade(u("colaborador", [], ["c1", "c2"]))).toEqual({
      OR: [
        {
          estado: "publicada",
          consorcioId: null,
          OR: [
            { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } },
            { audienciaUsuarios: { some: { id: "1" } } },
          ],
        },
        { estado: "publicada", consorcioId: { in: ["c1", "c2"] } },
      ],
    });
  });

  it("area sem setor cai na mesma regra de audiência do colaborador", () => {
    expect(filtroVisibilidade(u("area", []))).toEqual(filtroVisibilidade(u("colaborador", [])));
  });
});
