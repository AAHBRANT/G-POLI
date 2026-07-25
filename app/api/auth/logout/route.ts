import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { limparSessao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  limparSessao();
  return NextResponse.redirect(new URL("/login", authConfig.baseUrl));
}
