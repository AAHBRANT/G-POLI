import { NextRequest, NextResponse } from "next/server";
import { authConfig, authEnabled, redirectUri } from "@/lib/auth/config";
import { msalApp, SCOPES_WEB } from "@/lib/auth/msal";
import { criarSessao } from "@/lib/auth/session";
import { provisionarUsuario, temAcesso } from "@/lib/auth/usuario";
import {
  decodificarEstadoTeams,
  destinoPosLogin,
  hostRedirectConfiavel,
  origemDaSessao,
} from "@/lib/auth/estado";

export const dynamic = "force-dynamic";

// Repassa para a página final os parâmetros que o Teams anexou ao popup e que
// viajaram no `state`. Sem eles a página não tem como avisar o host.
//
// O `hostRedirectUrl` é validado AQUI, no servidor, antes de virar link: ele veio
// da query string, e redirecionar para host arbitrário seria open redirect. Se
// não passar na allowlist, é descartado — a página cai no aviso via SDK.
function montarDestinoFinal(state: string | null): string {
  const base = destinoPosLogin(state);
  const teams = decodificarEstadoTeams(state);
  if (!teams) return base;

  const p = new URLSearchParams();
  if (teams.authId) p.set("authId", teams.authId);
  if (teams.metodo) p.set("metodo", teams.metodo);
  if (hostRedirectConfiavel(teams.hostRedirectUrl)) {
    p.set("host", teams.hostRedirectUrl!);
  }

  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

// Callback do OAuth: troca o code por token, extrai identidade e cria sessão.
export async function GET(req: NextRequest) {
  if (!authEnabled) return NextResponse.redirect(new URL("/", authConfig.baseUrl));

  const code = req.nextUrl.searchParams.get("code");
  // Login iniciado no popup do Teams: o destino final não pode ser a raiz do
  // app (renderizaria o app dentro do popup). Termina na página que avisa o
  // Teams, que fecha o popup e devolve o controle para a aba.
  const state = req.nextUrl.searchParams.get("state");
  const destinoFinal = montarDestinoFinal(state);

  if (!code) {
    return NextResponse.redirect(new URL("/login?erro=sem_code", authConfig.baseUrl));
  }

  try {
    const resultado = await msalApp().acquireTokenByCode({
      code,
      scopes: SCOPES_WEB,
      redirectUri,
    });

    const conta = resultado.account;
    const oid = conta?.homeAccountId?.split(".")[0] ?? conta?.localAccountId ?? "";
    const nome = conta?.name ?? "";
    const email = conta?.username ?? "";

    // Allowlist (banco): fora da lista não cria sessão.
    if (!(await temAcesso(email))) {
      return NextResponse.redirect(new URL("/sem-acesso", authConfig.baseUrl));
    }

    await provisionarUsuario({ oid, email, nome });
    await criarSessao({ sub: oid, nome, email, origem: origemDaSessao(state) });

    return NextResponse.redirect(new URL(destinoFinal, authConfig.baseUrl));
  } catch (erro) {
    console.error("OAuth callback falhou:", erro);
    return NextResponse.redirect(new URL("/login?erro=falha_login", authConfig.baseUrl));
  }
}
