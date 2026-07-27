import { NextRequest, NextResponse } from "next/server";
import { authConfig, authEnabled, redirectUri } from "@/lib/auth/config";
import { msalApp, SCOPES_WEB } from "@/lib/auth/msal";
import { ESTADO_TEAMS } from "@/lib/auth/estado";

export const dynamic = "force-dynamic";

// Início do login web: redireciona para a tela de consentimento/login do Entra ID.
//
// Com `?teams=1` o fluxo foi aberto no popup do Teams (ver components/BotaoEntrar):
// marcamos isso no `state` do OAuth para que o callback termine numa página que
// avisa o Teams, em vez de mandar o popup para a raiz do app.
export async function GET(req: NextRequest) {
  if (!authEnabled) {
    return NextResponse.redirect(new URL("/", authConfig.baseUrl));
  }
  const noTeams = req.nextUrl.searchParams.get("teams") === "1";

  const url = await msalApp().getAuthCodeUrl({
    scopes: SCOPES_WEB,
    redirectUri,
    responseMode: "query",
    ...(noTeams ? { state: ESTADO_TEAMS } : {}),
  });
  return NextResponse.redirect(url);
}
