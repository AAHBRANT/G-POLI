// Regras puras de RBAC e acesso — SEM dependência de prisma/next.
// Isolado aqui para ser unit-testável. usuario.ts consome e reexporta.

export type Perfil = "superadmin" | "admin" | "sgi" | "diretoria" | "area" | "colaborador";

export type UsuarioAtual = {
  id: string | null;
  oid: string;
  nome: string;
  email: string;
  perfil: Perfil;
  setores: string[]; // ids dos setores (Area) vinculados ao usuário
  consorcios: string[]; // ids dos consórcios vinculados ao usuário
};

const ehSuper = (u: UsuarioAtual | null) => !!u && u.perfil === "superadmin";
const ehAdminOuSuper = (u: UsuarioAtual | null) => !!u && (u.perfil === "admin" || u.perfil === "superadmin");
const noSetor = (u: UsuarioAtual | null, areaId: string) => !!u && u.setores.includes(areaId);

// ---- Decisão de acesso (núcleo puro; a busca no banco fica em usuario.ts) ----
// - admin de bootstrap sempre entra;
// - usuário já cadastrado: respeita ativo (desativado bloqueia, mesmo no modo aberto);
// - novo: modo aberto libera e-mail do domínio da org; fechado exige convite.
export function regraAcesso(o: {
  email: string;
  adminEmails: string[];
  acessoAberto: boolean;
  dominios: string[];
  registro: { ativo: boolean } | null;
}): boolean {
  const e = (o.email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (o.adminEmails.includes(e)) return true;
  if (o.registro) return o.registro.ativo;
  return o.acessoAberto && o.dominios.some((d) => e.endsWith("@" + d.toLowerCase()));
}

// ---- Permissões ----

// Módulo de administração (usuários): Super Admin, Admin ou Gestor de Setor.
export function podeAdministrar(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "superadmin" || u.perfil === "admin" || u.perfil === "area");
}

// Gerir setores + promover/rebaixar admins: só Super Admin.
export function podeGerirSetores(u: UsuarioAtual | null): boolean {
  return ehSuper(u);
}
export function podeGerirAdmins(u: UsuarioAtual | null): boolean {
  return ehSuper(u);
}

// Gerir consórcios (criar/editar/ativar + vincular usuário): só Super Admin — mesma régua de Setores.
export function podeGerirConsorcios(u: UsuarioAtual | null): boolean {
  return ehSuper(u);
}

// Criar política: SGI, admin ou super.
export function podeCriarPolitica(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "sgi" || ehAdminOuSuper(u));
}

// Editar conteúdo (rascunho). SGI/admin/super: todas. Área: só setores do usuário.
export function podeEditarConteudo(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
): boolean {
  if (!u) return false;
  if (politica.estado !== "rascunho") return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId);
  return false;
}

// Editar UMA seção. SGI/admin/super: qualquer. Área: setor do usuário + seção liberada.
export function podeEditarSecao(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
  secao: { abertaAArea: boolean },
): boolean {
  if (!u) return false;
  if (politica.estado !== "rascunho") return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId) && secao.abertaAArea;
  return false;
}

// Liberar seções à área: SGI/admin/super.
export function podeGerirAberturaArea(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "sgi" || ehAdminOuSuper(u));
}

// Publicar: Diretoria, admin ou super.
export function podePublicar(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "diretoria" || ehAdminOuSuper(u));
}

// Revogar: mesma alçada de publicar (Diretoria, admin ou super).
export function podeRevogar(u: UsuarioAtual | null): boolean {
  return podePublicar(u);
}

// Publicada + dentro do público-alvo da política: audiência vazia (setor E
// usuário nenhum selecionado) = visível a todos, mesma semântica de
// audienciaVazia() em lib/politica/dominio.ts. Documento com consorcioId
// preenchido ignora o público-alvo por setor/usuário — o consórcio já
// define sozinho quem vê (ver spec docs/superpowers/specs/2026-08-02-consorcios-design.md).
function filtroPublicadaPorAudiencia(u: UsuarioAtual | null): Record<string, unknown> {
  const semPublicoAlvo = { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } };
  const OR: Record<string, unknown>[] = [semPublicoAlvo];
  if (u?.setores.length) OR.push({ audienciaSetores: { some: { id: { in: u.setores } } } });
  if (u?.id) OR.push({ audienciaUsuarios: { some: { id: u.id } } });
  return {
    OR: [
      { estado: "publicada", consorcioId: null, OR },
      { estado: "publicada", consorcioId: { in: u?.consorcios ?? [] } },
    ],
  };
}

// Visibilidade (busca/catálogo). super/admin/sgi/diretoria: tudo. area COM
// setor: publicadas sem consórcio (irrestrito) + publicadas do(s) consórcio(s)
// vinculado(s) + rascunhos/publicadas do próprio setor (gestão do próprio
// departamento, sempre visível independente de consórcio). Resto
// (colaborador; area sem setor): só publicadas DENTRO do próprio público-alvo
// (sem consórcio) ou do consórcio vinculado.
export function filtroVisibilidade(u: UsuarioAtual | null): Record<string, unknown> {
  if (u && (ehAdminOuSuper(u) || u.perfil === "sgi" || u.perfil === "diretoria")) return {};
  if (u && u.perfil === "area" && u.setores.length) {
    return {
      OR: [
        { estado: "publicada", consorcioId: null },
        { estado: "publicada", consorcioId: { in: u.consorcios } },
        { areaId: { in: u.setores } },
      ],
    };
  }
  return filtroPublicadaPorAudiencia(u);
}
