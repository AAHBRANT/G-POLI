import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { authConfig, SESSION_COOKIE } from "./config";

export type Sessao = {
  sub: string; // object id (oid) do usuário no Entra
  nome: string;
  email: string;
  origem: "teams" | "web";
};

function chave(): Uint8Array {
  return new TextEncoder().encode(authConfig.authSecret);
}

export async function criarSessao(dados: Sessao): Promise<void> {
  const token = await new SignJWT({ ...dados })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(chave());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function lerSessao(): Promise<Sessao | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave());
    return {
      sub: String(payload.sub ?? ""),
      nome: String(payload.nome ?? ""),
      email: String(payload.email ?? ""),
      origem: (payload.origem as Sessao["origem"]) ?? "web",
    };
  } catch {
    return null;
  }
}

export function limparSessao(): void {
  cookies().delete(SESSION_COOKIE);
}
