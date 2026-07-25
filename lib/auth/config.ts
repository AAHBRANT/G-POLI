// Configuração central de autenticação. Fonte: APP-SEG-220 / APP-TEC-201.
export const authConfig = {
  tenantId: process.env.AZURE_AD_TENANT_ID?.trim() ?? "",
  clientId: process.env.AZURE_AD_CLIENT_ID?.trim() ?? "",
  clientSecret: process.env.AZURE_AD_CLIENT_SECRET?.trim() ?? "",
  appIdUri: process.env.AZURE_AD_APP_ID_URI?.trim() ?? "",
  authSecret: process.env.AUTH_SECRET?.trim() ?? "",
  baseUrl: process.env.APP_BASE_URL?.trim() ?? "",
};

// Bootstrap: e-mails que recebem perfil admin na primeira entrada (nega por padrão para o resto).
export const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Allowlist de acesso (modo fechado): SÓ estes e-mails entram. Admins entram sempre.
export const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Modo de acesso: "1" (padrão) = ABERTO a todo o domínio da org; "0" = fechado (só allowlist/convite).
export const acessoAberto = (process.env.ACESSO_ABERTO ?? "1") !== "0";

// Domínios da organização que entram automaticamente no modo aberto.
export const dominiosOrg = (process.env.DOMINIOS_ORG ?? "aahbrant.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function ehDominioOrg(email: string): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return dominiosOrg.some((d) => e.endsWith("@" + d));
}

const authConfigurado = Boolean(
  authConfig.baseUrl &&
    authConfig.tenantId &&
    authConfig.clientId &&
    authConfig.clientSecret &&
    authConfig.authSecret,
);

// Permite abrir a preview local em modo dev quando houver um bypass explícito.
export const authEnabled = process.env.AUTH_PREVIEW_BYPASS === "1" ? false : authConfigurado;

export const authority = `https://login.microsoftonline.com/${authConfig.tenantId}`;
export const jwksUri = `${authority}/discovery/v2.0/keys`;
export const redirectUri = `${authConfig.baseUrl.replace(/\/$/, "")}/api/auth/callback`;

export const SESSION_COOKIE = "gpol_session";
