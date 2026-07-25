export const CLASSIFICACOES = [
  { valor: "publico_interno", rotulo: "Público interno", cor: "bg-emerald-100 text-emerald-800" },
  { valor: "restrito", rotulo: "Restrito", cor: "bg-amber-100 text-amber-800" },
  { valor: "confidencial", rotulo: "Confidencial", cor: "bg-red-100 text-red-800" },
] as const;

export const ESTADOS_POLITICA: Record<string, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "bg-black/10 text-black/70" },
  publicada: { rotulo: "Publicada", cor: "bg-emerald-100 text-emerald-800" },
  revogada: { rotulo: "Revogada", cor: "bg-red-100 text-red-800" },
};

export function rotuloClassificacao(valor: string): string {
  return CLASSIFICACOES.find((c) => c.valor === valor)?.rotulo ?? valor;
}

export function corClassificacao(valor: string): string {
  return CLASSIFICACOES.find((c) => c.valor === valor)?.cor ?? "bg-black/10 text-black/70";
}
