// Regras puras de "há quanto tempo essa Pendencia está parada": decide quais
// marcos de lembrete (3/7/15 dias) disparar e qual destaque visual usar onde
// a pendência já aparece hoje (home, sino). Sem I/O — sempre recebe `agora`
// como parâmetro, nunca lê o relógio internamente (mesmo padrão de
// dadosPendencia/acaoVersao).

export type MarcoLembrete = 3 | 7 | 15;

function diasCorridos(inicio: Date, agora: Date): number {
  return Math.floor((agora.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
}

// Cobre o caso do job ter ficado parado (ex.: agente de CI/infra offline) e
// rodar atrasado: dispara todos os marcos vencidos de uma vez, nunca pula o
// mais antigo. Cada marco só entra se o campo correspondente ainda for null.
export function lembretesPendentes(
  pendencia: {
    criadaEm: Date;
    lembrete3EnviadoEm: Date | null;
    lembrete7EnviadoEm: Date | null;
    lembrete15EnviadoEm: Date | null;
  },
  agora: Date,
): MarcoLembrete[] {
  const dias = diasCorridos(pendencia.criadaEm, agora);
  const marcos: MarcoLembrete[] = [];
  if (dias >= 3 && !pendencia.lembrete3EnviadoEm) marcos.push(3);
  if (dias >= 7 && !pendencia.lembrete7EnviadoEm) marcos.push(7);
  if (dias >= 15 && !pendencia.lembrete15EnviadoEm) marcos.push(15);
  return marcos;
}

export type NivelUrgenciaPendencia = "normal" | "atencao" | "alerta" | "critico";

// Destaque visual crescente por idade — não depende dos campos lembreteXEnviadoEm
// (esses só controlam o envio Teams); só de criadaEm, então funciona mesmo
// antes da Task 1 rodar em algum ambiente (campo novo é opcional).
export function nivelUrgenciaPendencia(criadaEm: Date, agora: Date): NivelUrgenciaPendencia {
  const dias = diasCorridos(criadaEm, agora);
  if (dias >= 15) return "critico";
  if (dias >= 7) return "alerta";
  if (dias >= 3) return "atencao";
  return "normal";
}

export function classesUrgenciaPendencia(nivel: NivelUrgenciaPendencia): string {
  switch (nivel) {
    case "critico":
      return "border-red-300 bg-red-50";
    case "alerta":
      return "border-orange-300 bg-orange-50";
    case "atencao":
      return "border-amber-300 bg-amber-50";
    default:
      return "";
  }
}
