// Regras puras do domínio de políticas (sem prisma/next/server actions).
// Extraídas para viabilizar teste (PR #11). As server actions passam a
// orquestrar chamando estas regras — comportamento idêntico ao anterior.
import path from "path";

// ---------------------------------------------------------------------------
// Código normativo
// ---------------------------------------------------------------------------

// Sigla da área para o código normativo. Multi-palavra → iniciais; palavra única → 3 letras.
export function siglaArea(nome: string): string {
  const limpo = nome.trim().replace(/[^A-Za-zÀ-ÿ0-9\s]/g, "");
  const palavras = limpo.split(/\s+/).filter(Boolean);
  let sigla: string;
  if (palavras.length > 1) {
    sigla = palavras.map((p) => p[0]).join("").slice(0, 4);
  } else {
    sigla = (palavras[0] ?? "GER").slice(0, 3);
  }
  return sigla
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Próximo sequencial dado o prefixo e os códigos já existentes com esse prefixo.
export function proximoSequencial(prefixo: string, codigos: (string | null | undefined)[]): number {
  let max = 0;
  for (const c of codigos) {
    const n = parseInt((c ?? "").slice(prefixo.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

// Formata o código normativo no padrão POL-<SIGLA>-NNN.
export function formatarCodigoNormativo(sigla: string, sequencial: number): string {
  return `POL-${sigla}-${String(sequencial).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------
export type Estado = "rascunho" | "publicada" | "revogada";
export type AcaoEstado = "publicar" | "revogar" | "reabrir";
export type ResultadoTransicao = { ok: true; estado: Estado } | { ok: false; erro: string };

// Só rascunho é editável (congelamento após publicação/revogação).
export function editavel(estado: Estado): boolean {
  return estado === "rascunho";
}

// Transição da máquina de estados. Retorna o estado resultante ou o erro
// (mensagens idênticas às das server actions originais).
export function transicao(atual: Estado, acao: AcaoEstado): ResultadoTransicao {
  switch (acao) {
    case "publicar":
      return atual === "rascunho"
        ? { ok: true, estado: "publicada" }
        : { ok: false, erro: "Só é possível publicar uma política em rascunho." };
    case "revogar":
      return atual === "publicada"
        ? { ok: true, estado: "revogada" }
        : { ok: false, erro: "Só é possível revogar uma política publicada." };
    case "reabrir":
      return atual === "rascunho"
        ? { ok: false, erro: "A política já está em rascunho." }
        : { ok: true, estado: "rascunho" };
  }
}

// ---------------------------------------------------------------------------
// Publicação / Snapshot
// ---------------------------------------------------------------------------
export type SecaoConteudo = {
  ordem: number;
  codigo: string;
  titulo: string;
  tipo: string;
  corpo: string;
  colunas?: unknown;
  linhas?: unknown;
};

// Há conteúdo publicável? Tabela = ao menos uma linha; texto = corpo não-vazio.
export function temConteudo(secoes: { tipo: string; corpo: string; linhas: unknown }[]): boolean {
  return secoes.some((s) =>
    s.tipo === "tabela"
      ? Array.isArray(s.linhas) && (s.linhas as unknown[]).length > 0
      : s.corpo.trim().length > 0,
  );
}

// Snapshot do conteúdo no momento da publicação (texto oficial congelado),
// ordenado por `ordem`.
export function montarSnapshot(secoes: SecaoConteudo[]) {
  return [...secoes]
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => ({
      codigo: s.codigo,
      titulo: s.titulo,
      tipo: s.tipo,
      corpo: s.corpo,
      colunas: (s.colunas as unknown) ?? null,
      linhas: (s.linhas as unknown) ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Versionamento / Upload
// ---------------------------------------------------------------------------
export const TIPOS_UPLOAD_PERMITIDOS = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"];
export const TAMANHO_UPLOAD_MAX = 25 * 1024 * 1024; // 25 MB

// Próximo número de versão dado o total atual (sequência começa em 1).
export function proximoNumeroVersao(totalAtual: number): number {
  return totalAtual + 1;
}

// Valida tamanho e extensão de um upload (mensagens idênticas às da action).
export function validarUpload(nome: string, tamanho: number): { ok: true } | { ok: false; erro: string } {
  if (tamanho > TAMANHO_UPLOAD_MAX) {
    return { ok: false, erro: "Arquivo acima de 25 MB." };
  }
  const ext = path.extname(nome).toLowerCase();
  if (!TIPOS_UPLOAD_PERMITIDOS.includes(ext)) {
    return { ok: false, erro: `Tipo não permitido (${ext || "sem extensão"}).` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// IA — aplicação do rascunho (tudo-ou-nada, ver DOMINIO.md invariante 10)
// ---------------------------------------------------------------------------
export type SecaoAlvo = { id: string; codigo: string; tipo: string };
export type RascunhoSecao = { codigo: string | number; corpo?: string; linhas?: string[][] };
export type AtualizacaoSecao = { id: string; data: { corpo: string } | { linhas: string[][] } };

// Decide (puro) quais seções atualizar e com quê, a partir das seções da política
// e do rascunho da IA. Só entra no plano a seção existente cujo conteúdo do draft
// é do tipo certo (tabela→linhas array; texto→corpo string). A action aplica o
// plano inteiro numa única transação — ou tudo, ou nada.
export function planejarAplicacaoIA(
  secoes: SecaoAlvo[],
  rascunho: RascunhoSecao[],
): AtualizacaoSecao[] {
  const porCodigo = new Map(secoes.map((s) => [s.codigo, s]));
  const plano: AtualizacaoSecao[] = [];
  for (const draft of rascunho) {
    const alvo = porCodigo.get(String(draft.codigo));
    if (!alvo) continue;
    if (alvo.tipo === "tabela") {
      if (Array.isArray(draft.linhas)) plano.push({ id: alvo.id, data: { linhas: draft.linhas } });
    } else if (typeof draft.corpo === "string") {
      plano.push({ id: alvo.id, data: { corpo: draft.corpo } });
    }
  }
  return plano;
}

// ---------------------------------------------------------------------------
// Público-alvo da notificação de publicação (v3)
// ---------------------------------------------------------------------------
export type UsuarioAlvo = { id: string; oid: string | null; nome: string; email: string };

// Sem setor E sem usuário selecionado = "todos os colaboradores ativos" — é o
// comportamento anterior a esta feature, preservado como default.
export function audienciaVazia(setorIds: string[], usuarioIds: string[]): boolean {
  return setorIds.length === 0 && usuarioIds.length === 0;
}

// União dos usuários dos setores selecionados com os usuários individuais,
// deduplicada por id (a mesma pessoa pode entrar pelos dois caminhos).
export function unirAudiencia(porSetor: UsuarioAlvo[], individuais: UsuarioAlvo[]): UsuarioAlvo[] {
  const mapa = new Map<string, UsuarioAlvo>();
  for (const u of [...porSetor, ...individuais]) mapa.set(u.id, u);
  return [...mapa.values()];
}
