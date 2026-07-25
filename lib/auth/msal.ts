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
