// Secret compartilhado entre o app e o Container Apps Job que dispara rotas
// de cron (ver docs/superpowers/specs/2026-08-02-lembretes-pendencia-ciencia-fase-d-design.md).
// Sem o secret configurado (ambiente de dev sem a env), NUNCA autoriza —
// fail-closed, não fail-open.
export const CRON_SECRET = process.env.CRON_SECRET?.trim() ?? "";

export function autorizadoCron(headerAutorizacao: string | null): boolean {
  if (!CRON_SECRET) return false;
  return headerAutorizacao === `Bearer ${CRON_SECRET}`;
}
