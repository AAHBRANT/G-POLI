import { NextRequest, NextResponse } from "next/server";
import { authConfig, authEnabled, redirectUri } from "@/lib/auth/config";
import { msalApp, SCOPES_WEB } from "@/lib/auth/msal";
import { criarSessao } from "@/lib/auth/session";
import { provisionarUsuario, temAcesso } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

// Callback do OAuth: troca o code por token, extrai identidade e cria sessão.
export async function GET(req: NextRequest) {
  if (!authEnabled) return NextResponse.redirect(new URL("/", authConfig.baseUrl));

  const code = req.nextUrl.searchParams.get("code");
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
    await criarSessao({ sub: oid, nome, email, origem: "web" });

    return NextResponse.redirect(new URL("/", authConfig.baseUrl));
  } catch (erro) {
    console.error("OAuth callback falhou:", erro);
    return NextResponse.redirect(new URL("/login?erro=falha_login", authConfig.baseUrl));
  }
}
