import { ConfidentialClientApplication } from "@azure/msal-node";
import { authConfig, authority } from "./config";

let instancia: ConfidentialClientApplication | null = null;

export function msalApp(): ConfidentialClientApplication {
  if (!instancia) {
    instancia = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId,
        clientSecret: authConfig.clientSecret,
        authority,
      },
    });
  }
  return instancia;
}

// Escopos mínimos para identificar o usuário (login web).
export const SCOPES_WEB = ["openid", "profile", "email", "User.Read"];

// Escopo de aplicação (client credentials) para chamar o Graph como o próprio
// app, sem usuário logado — usado para notificações (ver lib/graph.ts). Exige a
// permissão de aplicação TeamsActivity.Send com consentimento de admin no Entra.
export const SCOPES_GRAPH_APP = ["https://graph.microsoft.com/.default"];
