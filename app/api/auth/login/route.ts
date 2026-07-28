import { NextRequest, NextResponse } from "next/server";
import { authConfig, authEnabled, redirectUri } from "@/lib/auth/config";
import { msalApp, SCOPES_WEB } from "@/lib/auth/msal";
import { codificarEstadoTeams } from "@/lib/auth/estado";

export const dynamic = "force-dynamic";

// Início do login web: redireciona para a tela de consentimento/login do Entra ID.
//
// Com `?teams=1` o fluxo foi aberto no popup do Teams (ver components/BotaoEntrar).
// O Teams anexa a esta URL os seus próprios parâmetros — `authId`,
// `oauthRedirectMethod` e `hostRedirectUrl` — que são o único caminho de volta
// para avisar o host que o login terminou. Como daqui vamos para o Entra e só
// retornamos no callback, eles seriam perdidos: por isso viajam dentro do `state`
// do OAuth, que o Entra devolve intacto.
export async function GET(req: NextRequest) {
  if (!authEnabled) {
    return NextResponse.redirect(new URL("/", authConfig.baseUrl));
  }

  const q = req.nextUrl.searchParams;
  const noTeams = q.get("teams") === "1";

  const state = noTeams
    ? codificarEstadoTeams({
        authId: q.get("authId") ?? undefined,
        metodo: q.get("oauthRedirectMethod") ?? undefined,
        hostRedirectUrl: q.get("hostRedirectUrl") ?? undefined,
      })
    : undefined;

  const url = await msalApp().getAuthCodeUrl({
    scopes: SCOPES_WEB,
    redirectUri,
    responseMode: "query",
    ...(state ? { state } : {}),
  });
  return NextResponse.redirect(url);
}
