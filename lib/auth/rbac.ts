// Regras puras de RBAC e acesso — SEM dependência de prisma/next.
// Isolado aqui para ser unit-testável. usuario.ts consome e reexporta.
import { comentavel, type Estado } from "@/lib/politica/dominio";

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

// Anexar arquivo de apoio (planilha, formulário, original em Word…). NÃO altera o texto
// oficial, então vale em qualquer estado, exceto revogada: SGI/admin/super em todas e o
// Gestor de Setor nas do próprio setor.
export function podeAnexarArquivo(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
): boolean {
  if (!u) return false;
  if (politica.estado === "revogada") return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId);
  return false;
}

// Documento superior e prazo de revisão são METADADOS (não mudam o texto oficial),
// então SGI/admin/super podem ajustá-los em qualquer estado; o Gestor de Setor
// dono só enquanto o documento é rascunho (mesma alçada de editar o conteúdo).
export function podeGerirVinculos(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
): boolean {
  if (!u) return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  return podeEditarConteudo(u, politica);
}

// Vê os alertas de qualidade (revisão vencida, documento sem superior): gestão do SGC.
export function veAlertasDeQualidade(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "sgi" || u.perfil === "diretoria" || ehAdminOuSuper(u));
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

// Sprint 4/5/6: enviar para aprovação — mesma alçada de quem edita o
// conteúdo (quem monta o rascunho é quem decide que já está pronto).
export function podeEnviarParaAprovacao(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
): boolean {
  return podeEditarConteudo(u, politica);
}

// Aprovar/rejeitar na etapa do Gestor: perfil "area" (Gestor de Setor) do
// setor DONO da política, ou admin/super (override administrativo). SGI e
// Diretoria não são "o Gestor" — não entram aqui.
export function podeAprovarGestor(
  u: UsuarioAtual | null,
  politica: { areaId: string },
): boolean {
  if (!u) return false;
  if (ehAdminOuSuper(u)) return true;
  return u.perfil === "area" && noSetor(u, politica.areaId);
}

// Retirar da aprovação (o próprio autor "puxa de volta" pra ajustar antes de
// seguir): mesma alçada de quem editaria o conteúdo, MAS sem a exigência de
// estado === rascunho (óbvio — a política está numa das etapas de aprovação,
// não em rascunho, nesse momento).
export function podeRetirarDaAprovacao(
  u: UsuarioAtual | null,
  politica: { areaId: string },
): boolean {
  if (!u) return false;
  if (u.perfil === "sgi" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId);
  return false;
}

// Sprint 3: comentar uma seção (revisão por parágrafo, estilo Word).
// Diferente de podeEditarSecao — comentar NÃO edita o conteúdo, então Área
// pode comentar qualquer seção do próprio setor mesmo se não estiver
// "abertaAArea" (revisar ≠ escrever). Colaborador nunca comenta (só lê
// publicada). Faz sentido em rascunho e nas 2 etapas de aprovação (Sprint
// 4/5/6) — usa comentavel() do domínio pra não duplicar essa lista de
// estados aqui; só fica definitivamente fechado quando publicada/revogada.
export function podeComentarSecao(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
): boolean {
  if (!u) return false;
  if (!comentavel(politica.estado as Estado)) return false;
  if (u.perfil === "sgi" || u.perfil === "diretoria" || ehAdminOuSuper(u)) return true;
  if (u.perfil === "area") return noSetor(u, politica.areaId);
  return false;
}

// Resolver/reabrir um comentário: o autor do próprio comentário, ou quem já
// pode editar o conteúdo dessa política (SGI/admin/super) — Diretoria só
// aprova/publica, não é dona do conteúdo, então não resolve comentário de
// outra pessoa (só o que ela mesma abriu).
export function podeResolverComentario(
  u: UsuarioAtual | null,
  politica: { areaId: string; estado: string },
  comentario: { autorEmail: string },
): boolean {
  if (!u) return false;
  if (u.email.toLowerCase() === comentario.autorEmail.toLowerCase()) return true;
  return podeEditarConteudo(u, politica);
}

// Publicar (= aprovar na etapa da Diretoria): Diretoria, admin ou super.
export function podePublicar(u: UsuarioAtual | null): boolean {
  return !!u && (u.perfil === "diretoria" || ehAdminOuSuper(u));
}

// Aprovar/rejeitar na etapa da Diretoria: mesma alçada de publicar.
export const podeAprovarDiretoria = podePublicar;

// Revogar: mesma alçada de publicar (Diretoria, admin ou super).
export function podeRevogar(u: UsuarioAtual | null): boolean {
  return podePublicar(u);
}

// ---------------------------------------------------------------------------
// Visibilidade de documentos — classificação RESTRINGE de verdade
// ---------------------------------------------------------------------------
// Decisão do usuário (26/11/2026): "Restrito" e "Confidencial" deixam de ser só
// rótulo. Regras (valem para listas, busca, detalhe, edição, download, painel,
// ciência e para QUEM recebe aviso/pendência na publicação):
//
//  - Gestão (super admin, admin, SGI, Diretoria): vê tudo.
//  - Gestor de Setor (perfil "area"): vê tudo do(s) próprio(s) setor(es), em
//    qualquer estado e classificação (é quem gere o departamento).
//  - Demais casos exigem documento PUBLICADO e consórcio compatível
//    (sem consórcio, ou usuário vinculado a ele) e depois a classificação:
//      · público interno: como sempre — sem consórcio, vale o público-alvo
//        (vazio = todos); com consórcio, os vinculados ao consórcio.
//        (Gestor de Setor continua vendo todos os públicos internos sem consórcio.)
//      · restrito: só quem é do setor dono do documento, de um setor listado no
//        público-alvo, ou está nominalmente no público-alvo. Público-alvo VAZIO
//        NÃO significa "todos": significa só o setor dono.
//      · confidencial: só quem está NOMINALMENTE no público-alvo (setor listado
//        não basta). Além da gestão e do Gestor do setor dono.
//  - Sem usuário (null): nada.

export type Classificacao = "publico_interno" | "restrito" | "confidencial";

export type DocumentoVisivel = {
  estado: string;
  classificacao: Classificacao;
  areaId: string;
  consorcioId: string | null;
  audienciaSetorIds: string[];
  audienciaUsuarioIds: string[];
};

const ehGestao = (u: UsuarioAtual) => ehAdminOuSuper(u) || u.perfil === "sgi" || u.perfil === "diretoria";

/** Fonte da verdade (em memória) de "este usuário pode ver este documento?". */
export function podeVerDocumento(u: UsuarioAtual | null, d: DocumentoVisivel): boolean {
  if (!u) return false;
  if (ehGestao(u)) return true;
  const gestorDeSetor = u.perfil === "area" && u.setores.length > 0;
  if (gestorDeSetor && u.setores.includes(d.areaId)) return true;
  if (d.estado !== "publicada") return false;

  const consorcioOk = d.consorcioId === null || u.consorcios.includes(d.consorcioId);
  const noSetorAudiencia = d.audienciaSetorIds.some((id) => u.setores.includes(id));
  const nominal = !!u.id && d.audienciaUsuarioIds.includes(u.id);

  switch (d.classificacao) {
    case "confidencial":
      return consorcioOk && nominal;
    case "restrito":
      return consorcioOk && (u.setores.includes(d.areaId) || noSetorAudiencia || nominal);
    default: // publico_interno
      if (d.consorcioId !== null) return consorcioOk;
      if (gestorDeSetor) return true;
      return (d.audienciaSetorIds.length === 0 && d.audienciaUsuarioIds.length === 0) || noSetorAudiencia || nominal;
  }
}

/** Mesma regra de podeVerDocumento, como filtro do Prisma (listas, busca, detalhe, download…). */
export function filtroVisibilidade(u: UsuarioAtual | null): Record<string, unknown> {
  if (!u) return { id: "__sem_acesso__" };
  if (ehGestao(u)) return {};

  const gestorDeSetor = u.perfil === "area" && u.setores.length > 0;
  const publicada = { estado: "publicada" };
  const consorcioOk = { OR: [{ consorcioId: null }, { consorcioId: { in: u.consorcios } }] };
  const ramos: Record<string, unknown>[] = [];

  // Gestor de Setor: tudo do próprio setor.
  if (gestorDeSetor) ramos.push({ areaId: { in: u.setores } });

  // Público interno.
  if (u.consorcios.length) {
    ramos.push({ ...publicada, classificacao: "publico_interno", consorcioId: { in: u.consorcios } });
  }
  const audiencia: Record<string, unknown>[] = [{ audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } }];
  if (u.setores.length) audiencia.push({ audienciaSetores: { some: { id: { in: u.setores } } } });
  if (u.id) audiencia.push({ audienciaUsuarios: { some: { id: u.id } } });
  ramos.push(
    gestorDeSetor
      ? { ...publicada, classificacao: "publico_interno", consorcioId: null }
      : { ...publicada, classificacao: "publico_interno", consorcioId: null, OR: audiencia },
  );

  // Restrito: setor dono, setor do público-alvo ou nominal (vazio NÃO é "todos").
  const explicitos: Record<string, unknown>[] = [];
  if (u.setores.length) {
    explicitos.push({ areaId: { in: u.setores } });
    explicitos.push({ audienciaSetores: { some: { id: { in: u.setores } } } });
  }
  if (u.id) explicitos.push({ audienciaUsuarios: { some: { id: u.id } } });
  if (explicitos.length) {
    ramos.push({ ...publicada, classificacao: "restrito", AND: [consorcioOk, { OR: explicitos }] });
  }

  // Confidencial: só nominal.
  if (u.id) {
    ramos.push({
      ...publicada,
      classificacao: "confidencial",
      AND: [consorcioOk, { audienciaUsuarios: { some: { id: u.id } } }],
    });
  }

  return { OR: ramos };
}
