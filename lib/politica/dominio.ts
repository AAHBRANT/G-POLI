// Regras puras do domínio de políticas (sem prisma/next/server actions).
// Extraídas para viabilizar teste (PR #11). As server actions passam a
// orquestrar chamando estas regras — comportamento idêntico ao anterior.
import path from "path";

// ---------------------------------------------------------------------------
// Código normativo
// ---------------------------------------------------------------------------

// Sigla oficial de Área Responsável (AR) — tabela "Areas Responsaveis" da
// planilha Codificação de Documentos (Tabelas de Apoio), conferida em
// 2026-07-30. Chave normalizada (minúsculo, sem acento) → sigla oficial.
const AREAS_OFICIAIS: Record<string, string> = {
  "diretoria": "DIR",
  "alta direcao": "DIR",
  "sistema de gestao integrado": "SGI",
  "sgi": "SGI",
  "qualidade": "QUA",
  "engenharia e projetos": "ENG",
  "engenharia": "ENG",
  "obras e producao": "OBR",
  "obras": "OBR",
  "suprimentos e compras": "SUP",
  "suprimentos": "SUP",
  "comercial e orcamentos": "COM",
  "comercial": "COM",
  "administrativo e financeiro": "ADM",
  "administrativo": "ADM",
  "financeiro": "ADM",
  "recursos humanos": "RH",
  "seguranca do trabalho e saude ocupacional": "SSO",
  "seguranca do trabalho": "SSO",
  "sso": "SSO",
  "meio ambiente": "MA",
  "planejamento": "PLJ",
  "proposta": "PRP",
  "social": "SOC",
  "tecnologia da informacao": "TI",
  "ti": "TI",
};

function normalizarNomeArea(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Sigla da área para o código normativo. Área cadastrada com nome que bate
// (exato, normalizado) com a tabela oficial do SGI usa a sigla oficial;
// senão cai no fallback anterior (iniciais/3 letras) — área ainda não
// alinhada ao vocabulário oficial não pode travar o cadastro.
export function siglaArea(nome: string): string {
  const oficial = AREAS_OFICIAIS[normalizarNomeArea(nome)];
  if (oficial) return oficial;

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

// Organização emissora padrão (código ORG-TD-AR-SEQ). AAHBRANT isolada, sempre
// "AHBT" — a exceção (consórcio, ORG diferente) foi adiada por decisão do
// usuário (2026-07-30): não há hoje seleção de ORG no cadastro de política.
export const ORG_PADRAO = "AHBT";

// Próximo sequencial dado o prefixo e os códigos já existentes com esse prefixo.
export function proximoSequencial(prefixo: string, codigos: (string | null | undefined)[]): number {
  let max = 0;
  for (const c of codigos) {
    const n = parseInt((c ?? "").slice(prefixo.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

// Próximo sequencial por ÁREA (regra oficial — ver Codificação de Documentos,
// aba "Gerador de Código": SEQ é comum a todos os TDs da mesma área, não
// isolado por tipo). Diferente de `proximoSequencial`, não recebe prefixo:
// os códigos podem ter tipos (segmento TD) diferentes entre si, então extrai
// só o último segmento (o SEQ) de cada código, ignorando o resto.
export function proximoSequencialArea(codigos: (string | null | undefined)[]): number {
  let max = 0;
  for (const c of codigos) {
    if (!c) continue;
    const partes = c.split("-");
    const n = parseInt(partes[partes.length - 1], 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

// Formata o código normativo no padrão oficial ORG-TD-AR-SEQ (planilha
// Codificação de Documentos, conferida em 2026-07-30). Revisão fica de fora
// de propósito: `Politica.revisao` já é rastreada à parte e muda a cada
// republicação — embuti-la aqui obrigaria mudar um campo @unique toda vez
// que a política fosse republicada.
export function formatarCodigoNormativo(sigla: string, sequencial: number, prefixo = "POL"): string {
  return `${ORG_PADRAO}-${prefixo}-${sigla}-${String(sequencial).padStart(3, "0")}`;
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

// ---------------------------------------------------------------------------
// Ciência de leitura (v3): trava de tempo mínimo
// ---------------------------------------------------------------------------

// Tempo mínimo entre abrir o documento e confirmar ciência — barra o caso
// trivial (clique disparado sem leitura nenhuma). Não é prova de leitura: o
// timestamp de abertura vem do cliente, então é contornável por quem chama a
// Server Action direto. A trava real de UX é a rolagem até o fim
// (components/politica/CienciaLeitura.tsx); isto é só o que o servidor
// consegue de fato validar.
export const TEMPO_MINIMO_LEITURA_MS = 3000;

export function leituraValida(abertoEm: string, agora: Date): boolean {
  const inicio = Date.parse(abertoEm);
  return Number.isFinite(inicio) && agora.getTime() - inicio >= TEMPO_MINIMO_LEITURA_MS;
}

// ---------------------------------------------------------------------------
// Geração do documento oficial (.docx)
// ---------------------------------------------------------------------------

// Achata uma seção pro texto simples do .docx gerado. Seção de tabela vira
// linhas separadas por quebra, células por " | " — v1 não gera tabela Word
// real (ver docs/superpowers/specs/2026-07-30-geracao-docx-oficial-design.md,
// "Não-objetivos"), só o cabeçalho/rodapé precisam de fidelidade perfeita.
export function corpoParaTexto(secao: {
  tipo: string;
  corpo: string;
  colunas?: unknown;
  linhas?: unknown;
}): string {
  if (secao.tipo !== "tabela") return secao.corpo;
  const colunas = (secao.colunas as string[] | null) ?? [];
  const linhas = (secao.linhas as string[][] | null) ?? [];
  const partes: string[] = [];
  if (colunas.length > 0) partes.push(colunas.join(" | "));
  for (const linha of linhas) partes.push(linha.join(" | "));
  return partes.join("\n");
}
