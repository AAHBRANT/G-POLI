import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/config";
import { validarTokenTeams } from "@/lib/auth/teamsToken";
import { criarSessao } from "@/lib/auth/session";
import { provisionarUsuario, temAcesso } from "@/lib/auth/usuario";

// Recebe o token SSO do Teams (getAuthToken), valida e cria a sessão.
export async function POST(req: Request) {
  if (!authEnabled) {
    return NextResponse.json({ ok: false, erro: "Auth desativada." }, { status: 400 });
  }
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, erro: "Token ausente." }, { status: 400 });
    }
    const id = await validarTokenTeams(token);
    if (!(await temAcesso(id.email))) {
      return NextResponse.json({ ok: false, erro: "sem_acesso" }, { status: 403 });
    }
    await provisionarUsuario({ oid: id.oid, email: id.email, nome: id.nome });
    await criarSessao({
      sub: id.oid,
      nome: id.nome,
      email: id.email,
      origem: "teams",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, erro: "Token do Teams inválido." },
      { status: 401 },
    );
  }
}
