// Marcador colocado no `state` do OAuth quando o login foi iniciado pelo popup
// do Teams. O callback usa isso para decidir onde terminar: página que avisa o
// Teams (popup) em vez da raiz do app.
//
// Fica em arquivo próprio porque é lido por duas rotas de servidor
// (login e callback) e precisa ser exatamente o mesmo valor nas duas.
export const ESTADO_TEAMS = "teams";

// Rota pública que fecha o popup do Teams (ver middleware.ts).
export const ROTA_FIM_TEAMS = "/entrar/teams-fim";

// Para onde o callback do OAuth manda o navegador depois de criar a sessão.
// Login vindo do popup do Teams termina na página que fecha o popup; qualquer
// outra origem vai para a raiz do app. Regra pura, para ser testável sem MSAL.
export function destinoPosLogin(state: string | null): string {
  return state === ESTADO_TEAMS ? ROTA_FIM_TEAMS : "/";
}

// Se a sessão nasceu no popup do Teams, a origem registrada é "teams".
export function origemDaSessao(state: string | null): "teams" | "web" {
  return state === ESTADO_TEAMS ? "teams" : "web";
}
