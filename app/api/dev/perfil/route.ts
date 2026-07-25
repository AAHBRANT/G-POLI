import { NextRequest, NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/config";

// Somente em modo dev (auth desligada): troca o perfil simulado para teste.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (authEnabled) return new NextResponse("Indisponível", { status: 404 });
  const p = req.nextUrl.searchParams.get("p") ?? "admin";
  const res = NextResponse.redirect(new URL(req.headers.get("referer") ?? "/", req.url));
  res.cookies.set("gpol_dev_perfil", p, { path: "/" });
  return res;
}
