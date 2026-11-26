import { tipoDocumentoValido, type TipoDocumentoValor } from "@/lib/constants";

// Regras puras da visão "biblioteca" — usada nas telas de cada tipo de documento
// (Políticas, Normas, Procedimentos…) e na Busca. A VISIBILIDADE do usuário
// (filtroVisibilidade) é sempre aplicada: quem não é gestão só enxerga publicados
// do próprio público-alvo; quem é gestão enxerga também rascunhos, documentos em
// aprovação e revogados, e pode filtrar por estado.

export const ESTADOS_FILTRAVEIS = [
  "publicada",
  "em_aprovacao_diretoria",
  "em_aprovacao_gestor",
  "rascunho",
  "revogada",
] as const;
export type EstadoFiltravel = (typeof ESTADOS_FILTRAVEIS)[number];

export type ParamsBiblioteca = {
  q: string;
  tipo: TipoDocumentoValor | "";
  areaId: string;
  estado: EstadoFiltravel | "";
};

const MAX_BUSCA = 100;

export function normalizarParamsBiblioteca(bruto: {
  q?: string;
  tipo?: string;
  area?: string;
  estado?: string;
}): ParamsBiblioteca {
  const q = (bruto.q ?? "").trim().slice(0, MAX_BUSCA);
  const tipo = bruto.tipo && tipoDocumentoValido(bruto.tipo) ? bruto.tipo : "";
  const areaId = (bruto.area ?? "").trim();
  const estado = (ESTADOS_FILTRAVEIS as readonly string[]).includes(bruto.estado ?? "")
    ? (bruto.estado as EstadoFiltravel)
    : "";
  return { q, tipo, areaId, estado };
}

export function temCriterioBiblioteca(p: ParamsBiblioteca): boolean {
  return Boolean(p.q || p.tipo || p.areaId || p.estado);
}

/** Base: a visibilidade do usuário (e, nas telas de um tipo só, o tipo). Sem filtros de tela. */
export function whereBase(visibilidade: Record<string, unknown>, tipo?: TipoDocumentoValor) {
  const and: Record<string, unknown>[] = [visibilidade];
  if (tipo) and.push({ tipo });
  return { AND: and };
}

/** Base + filtros de tipo, setor, estado e busca. `idsPorTabela` = ids achados no conteúdo de tabelas. */
export function whereBiblioteca(
  visibilidade: Record<string, unknown>,
  p: ParamsBiblioteca,
  idsPorTabela: string[] = [],
) {
  const and: Record<string, unknown>[] = [visibilidade];
  if (p.tipo) and.push({ tipo: p.tipo });
  if (p.areaId) and.push({ areaId: p.areaId });
  if (p.estado) and.push({ estado: p.estado });
  if (p.q) {
    and.push({
      OR: [
        { titulo: { contains: p.q, mode: "insensitive" } },
        { codigo: { contains: p.q, mode: "insensitive" } },
        { secoes: { some: { corpo: { contains: p.q, mode: "insensitive" } } } },
        ...(idsPorTabela.length ? [{ id: { in: idsPorTabela } }] : []),
      ],
    });
  }
  return { AND: and };
}

/** Monta a URL (da tela `base`) preservando os filtros, com overrides. */
export function hrefBiblioteca(base: string, p: ParamsBiblioteca, mudar: Partial<ParamsBiblioteca> = {}): string {
  const f = { ...p, ...mudar };
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.tipo) qs.set("tipo", f.tipo);
  if (f.areaId) qs.set("area", f.areaId);
  if (f.estado) qs.set("estado", f.estado);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
