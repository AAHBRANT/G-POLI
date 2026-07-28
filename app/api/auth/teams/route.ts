import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/config";
import { validarTokenTeams } from "@/lib/auth/teamsToken";
import { criarSessao } from "@/lib/auth/session";
import { provisionarUsuario, temAcesso } from "@/lib/auth/usuario";

// Recebe o token SSO do Teams (getAuthToken), valida e cria a sessão.
//
// As falhas são separadas de propósito. Antes, um único `catch` transformava
// QUALQUER erro em `401 "Token do Teams inválido."` — inclusive banco fora do ar.
// Em 2026-07-28 isso levou o diagnóstico de uma queda do PostgreSQL para o lado
// do manifest do Teams, porque a tela afirmava que o problema era de identidade.
//
// - 401: o token não vale (assinatura, emissor, audiência).
// - 403: token válido, e-mail sem acesso.
// - 503: token válido, mas não conseguimos concluir (banco, provisão, sessão).
//
// O detalhe do erro vai só para o log; o cliente recebe a categoria. A tela fica
// honesta sem expor interno de infraestrutura a quem chamou.
export async function POST(req: Request) {
  if (!authEnabled) {
    return NextResponse.json({ ok: false, erro: "auth_desativada" }, { status: 400 });
  }

  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo_invalido" }, { status: 400 });
  }
  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, erro: "token_ausente" }, { status: 400 });
  }

  let identidade;
  try {
    identidade = await validarTokenTeams(token);
  } catch (erro) {
    console.error("SSO Teams: token rejeitado na validação:", erro);
    return NextResponse.json({ ok: false, erro: "token_invalido" }, { status: 401 });
  }

  try {
    if (!(await temAcesso(identidade.email))) {
      return NextResponse.json({ ok: false, erro: "sem_acesso" }, { status: 403 });
    }
    await provisionarUsuario({
      oid: identidade.oid,
      email: identidade.email,
      nome: identidade.nome,
    });
    await criarSessao({
      sub: identidade.oid,
      nome: identidade.nome,
      email: identidade.email,
      origem: "teams",
    });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    // O token era válido: a falha é nossa (tipicamente o banco). 503 e não 401,
    // para quem usa e quem investiga não perderem tempo com identidade.
    console.error("SSO Teams: token válido, falha ao criar sessão:", erro);
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });
  }
}
