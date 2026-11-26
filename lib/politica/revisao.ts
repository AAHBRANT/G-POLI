// Prazo de revisão dos documentos (etapa 2): todo documento publicado tem uma
// "próxima revisão". Documento com revisão vencida continua vigente, mas é
// sinalizado para o SGI/gestão (e será conferido pela varredura da IA).

export const PERIODICIDADE_PADRAO_MESES = 12;
export const PERIODICIDADES_MESES = [6, 12, 18, 24, 36] as const;
export const DIAS_AVISO_VENCIMENTO = 30;

export type SituacaoRevisao = "em_dia" | "vence_em_breve" | "vencida";

/** Soma meses preservando o fim do mês (31/01 + 1 mês = 28/02 ou 29/02). */
export function somarMeses(data: Date, meses: number): Date {
  const r = new Date(data.getTime());
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimoDia));
  return r;
}

export function periodicidadeValida(meses: number): boolean {
  return Number.isInteger(meses) && meses >= 1 && meses <= 60;
}

/** Próxima revisão a partir de uma data-base (publicação ou última revisão). */
export function calcularProximaRevisao(base: Date, meses: number): Date {
  return somarMeses(base, meses);
}

const MS_DIA = 24 * 60 * 60 * 1000;

/** Dias inteiros até a revisão (negativo = vencida há N dias). */
export function diasParaRevisao(proxima: Date, agora: Date): number {
  return Math.ceil((proxima.getTime() - agora.getTime()) / MS_DIA);
}

export function situacaoRevisao(proxima: Date | null, agora: Date): SituacaoRevisao | null {
  if (!proxima) return null;
  const dias = diasParaRevisao(proxima, agora);
  if (dias < 0) return "vencida";
  if (dias <= DIAS_AVISO_VENCIMENTO) return "vence_em_breve";
  return "em_dia";
}

export function textoRevisao(proxima: Date | null, agora: Date): string | null {
  if (!proxima) return null;
  const dias = diasParaRevisao(proxima, agora);
  if (dias < 0) return `Revisão vencida há ${-dias} ${-dias === 1 ? "dia" : "dias"}`;
  if (dias === 0) return "Revisão vence hoje";
  return `Revisão em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}
