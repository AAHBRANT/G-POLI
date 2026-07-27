import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { authEnabled } from "@/lib/auth/config";

const SESSION_COOKIE = "gpol_session";

async function sessaoValida(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const chave = new TextEncoder().encode(process.env.AUTH_SECRET);
    await jwtVerify(token, chave);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  // Modo dev: auth desligada → libera tudo (aviso aparece no header).
  if (!authEnabled) return NextResponse.next();

  if (await sessaoValida(req)) return NextResponse.next();

  // Sem sessão → nega por padrão, manda para o login.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Protege tudo, exceto login, rotas de auth, o health check das probes,
  // assets e arquivos estáticos. /api/health precisa ser público senão as
  // probes do Container App tomam 302→/login e o app nunca fica "saudável".
  matcher: ["/((?!login|sem-acesso|api/auth|api/health|_next/static|_next/image|favicon.ico).*)"],
};
