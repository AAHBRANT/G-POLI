// Estado do OAuth quando o login foi iniciado pelo popup do Teams.
//
// O Teams anexa parâmetros próprios à URL que passamos para
// `authentication.authenticate()` — `authId`, `oauthRedirectMethod` e
// `hostRedirectUrl`. Eles são a única forma de o popup dizer ao Teams que o
// login terminou.
//
// O problema que isto resolve: nosso fluxo redireciona para o Entra e volta no
// callback, e nesse caminho os parâmetros do Teams se perdiam. Sem eles, a
// página final não consegue avisar o host — em 2026-07-28 a página instrumentada
// respondeu exatamente "Initialization Failed. No Parent window found.", e o
// popup virava janela solta com a sessão já criada.
//
// Solução: empacotar os parâmetros no `state` do OAuth, que o Entra devolve
// intacto no callback. Fica em arquivo próprio porque é lido por duas rotas de
// servidor (login e callback) e precisa ser idêntico nas duas.

export const ESTADO_TEAMS = "teams";

/** Separa o marcador da carga: `teams.<base64url>`. */
const SEPARADOR = ".";

/** Rota pública que encerra o popup do Teams (ver middleware.ts). */
export const ROTA_FIM_TEAMS = "/entrar/teams-fim";

export type ParametrosTeams = {
  authId?: string;
  /** `web` (avisa via SDK) ou `deeplink` (volta pelo hostRedirectUrl). */
  metodo?: string;
  hostRedirectUrl?: string;
};

function paraBase64Url(texto: string): string {
  return Buffer.from(texto, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function deBase64Url(texto: string): string {
  const normalizado = texto.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalizado, "base64").toString("utf8");
}

/**
 * Monta o `state` do OAuth para o fluxo do popup do Teams.
 * Sem parâmetros ainda marca o fluxo como Teams — o `state` é o que diz ao
 * callback para não terminar na raiz do app.
 */
export function codificarEstadoTeams(p: ParametrosTeams = {}): string {
  const carga: ParametrosTeams = {};
  if (p.authId) carga.authId = p.authId;
  if (p.metodo) carga.metodo = p.metodo;
  if (p.hostRedirectUrl) carga.hostRedirectUrl = p.hostRedirectUrl;

  if (Object.keys(carga).length === 0) return ESTADO_TEAMS;
  return ESTADO_TEAMS + SEPARADOR + paraBase64Url(JSON.stringify(carga));
}

/** É um `state` de fluxo do popup do Teams? */
export function ehEstadoTeams(state: string | null): boolean {
  if (!state) return false;
  return state === ESTADO_TEAMS || state.startsWith(ESTADO_TEAMS + SEPARADOR);
}

/**
 * Extrai os parâmetros do Teams do `state`. Devolve objeto vazio quando não há
 * carga, e `null` quando o `state` não é do fluxo do Teams.
 *
 * Carga corrompida NÃO derruba o login: cai para objeto vazio, e a página final
 * ainda tenta avisar o Teams pelo SDK. Perder o atalho é melhor que perder a
 * sessão que já foi criada.
 */
export function decodificarEstadoTeams(state: string | null): ParametrosTeams | null {
  if (!ehEstadoTeams(state)) return null;
  if (state === ESTADO_TEAMS) return {};

  const carga = state!.slice((ESTADO_TEAMS + SEPARADOR).length);
  try {
    const obj = JSON.parse(deBase64Url(carga)) as unknown;
    if (!obj || typeof obj !== "object") return {};
    const { authId, metodo, hostRedirectUrl } = obj as Record<string, unknown>;
    return {
      authId: typeof authId === "string" ? authId : undefined,
      metodo: typeof metodo === "string" ? metodo : undefined,
      hostRedirectUrl: typeof hostRedirectUrl === "string" ? hostRedirectUrl : undefined,
    };
  } catch {
    return {};
  }
}

/** Para onde o callback manda o navegador depois de criar a sessão. */
export function destinoPosLogin(state: string | null): string {
  return ehEstadoTeams(state) ? ROTA_FIM_TEAMS : "/";
}

/** Se a sessão nasceu no popup do Teams, a origem registrada é "teams". */
export function origemDaSessao(state: string | null): "teams" | "web" {
  return ehEstadoTeams(state) ? "teams" : "web";
}

// Hosts para os quais é permitido redirecionar no fim do fluxo.
//
// OBRIGATÓRIO validar: o `hostRedirectUrl` chega pela query string, ou seja é
// entrada não confiável. Redirecionar sem checar seria open redirect — bastaria
// alguém montar um link do nosso domínio que devolve a vítima em site próprio.
const HOSTS_TEAMS = [
  "teams.microsoft.com",
  "teams.cloud.microsoft",
  "teams.live.com",
  "office.com",
  "microsoft365.com",
  "cloud.microsoft",
];

/**
 * Só aceita HTTPS e host do Teams/Microsoft (o próprio domínio ou subdomínio).
 * Compara por rótulo de domínio — `teams.microsoft.com.atacante.br` não passa.
 */
export function hostRedirectConfiavel(url: string | undefined | null): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase();
  return HOSTS_TEAMS.some((h) => host === h || host.endsWith("." + h));
}
