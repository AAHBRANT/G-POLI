import { NextResponse } from "next/server";
import { authConfig, authEnabled, redirectUri } from "@/lib/auth/config";
import { msalApp, SCOPES_WEB } from "@/lib/auth/msal";

export const dynamic = "force-dynamic";

// Início do login web: redireciona para a tela de consentimento/login do Entra ID.
export async function GET() {
  if (!authEnabled) {
    return NextResponse.redirect(new URL("/", authConfig.baseUrl));
  }
  const url = await msalApp().getAuthCodeUrl({
    scopes: SCOPES_WEB,
    redirectUri,
    responseMode: "query",
  });
  return NextResponse.redirect(url);
}
