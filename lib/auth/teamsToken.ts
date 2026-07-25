import { createRemoteJWKSet, jwtVerify } from "jose";
import { authConfig, jwksUri, authority } from "./config";

const jwks = createRemoteJWKSet(new URL(jwksUri));

export type IdentidadeTeams = {
  oid: string;
  nome: string;
  email: string;
};

// Valida o token SSO emitido pelo Teams (getAuthToken). Confere assinatura, emissor e audiência.
export async function validarTokenTeams(token: string): Promise<IdentidadeTeams> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${authority}/v2.0`,
    audience: [authConfig.clientId, authConfig.appIdUri].filter(Boolean),
  });

  const oid = String(payload.oid ?? payload.sub ?? "");
  const nome = String(payload.name ?? "");
  const email = String(
    payload.preferred_username ?? payload.upn ?? payload.email ?? "",
  );

  if (!oid) throw new Error("Token sem identificador de usuário (oid).");
  return { oid, nome, email };
}
