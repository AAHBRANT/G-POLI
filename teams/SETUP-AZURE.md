# Configuração Entra ID + Teams SSO — G-Políticas

Passo a passo para ATIVAR a autenticação. Enquanto os campos do `.env` estiverem vazios, o app roda em modo dev (aberto, com aviso).

## 1. Registrar o app no Microsoft Entra ID
1. Portal Azure → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Nome: `G-Políticas`. Contas: **Single tenant** (só AAHBRANT).
3. Redirect URI (tipo **Web**): `https://SEU-DOMINIO/api/auth/callback` (em dev com túnel: `https://SEU-TUNEL/api/auth/callback`).
4. Anote **Directory (tenant) ID** e **Application (client) ID**.

## 2. Criar segredo do cliente
**Certificates & secrets** → **New client secret** → copie o **Value** (aparece uma vez só).

## 3. Expor uma API (necessário para o SSO do Teams)
1. **Expose an API** → **Set** Application ID URI. Use `api://SEU-DOMINIO/CLIENT_ID`.
2. **Add a scope**: nome `access_as_user`, quem consente **Admins and users**, habilitado.
3. **Add a client application** — pré-autorize os client IDs oficiais do Teams (todos):
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
   Marque o escopo `access_as_user` para cada.

## 4. Permissões de API
**API permissions** → Microsoft Graph → **Delegated**: `openid`, `profile`, `email`, `User.Read` → **Grant admin consent**.

## 5. Preencher o `.env`
```
AZURE_AD_TENANT_ID="<tenant id>"
AZURE_AD_CLIENT_ID="<client id>"
AZURE_AD_CLIENT_SECRET="<secret value>"
AZURE_AD_APP_ID_URI="api://SEU-DOMINIO/<client id>"
AUTH_SECRET="<gere: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\">"
APP_BASE_URL="https://SEU-DOMINIO"
```
Reinicie o dev server. O login passa a ser exigido.

## 6. Manifesto do Teams
Em `teams/manifest.json`, substitua os placeholders:
- `{{TEAMS_APP_ID}}` — um GUID novo para o app no Teams.
- `{{APP_DOMAIN}}` — domínio público (sem https://), ex.: `gpoliticas.aahbrant.com`.
- `{{CLIENT_ID}}` — Application (client) ID.
- `{{APP_ID_URI}}` — o mesmo `api://...` do passo 3.

Adicione `color.png` (192×192) e `outline.png` (32×32, transparente) na pasta `teams/`, compacte os 3 arquivos e faça upload em **Teams → Apps → Manage your apps → Upload a custom app**.

## 7. Testar localmente no Teams
Teams exige HTTPS público. Use um túnel (ex.: `dev tunnels` do VS Code ou ngrok) apontando para `localhost:3000`, e use a URL do túnel como `APP_BASE_URL` / domínio no manifesto e no redirect URI.

## Notas de segurança
- Segredo do cliente nunca vai para o Git (`.env` está no `.gitignore`).
- Sessão em cookie httpOnly assinado (HS256), expira em 8h.
- Rota protegida por padrão: sem sessão → redireciona para `/login` (nega por padrão, M-04).
- Rotação do segredo: agendar antes do vencimento (registrar responsável em APP-SEG-220).
