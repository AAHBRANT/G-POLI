# Deploy no Azure App Service — G-Políticas

Piloto: URL `*.azurewebsites.net`, deploy pela extensão do VS Code. Região **Brazil South**.
Nomes sugeridos (ajuste se quiser): RG `rg-gpoliticas` · App `gpoliticas-aahbrant` → `https://gpoliticas-aahbrant.azurewebsites.net`.

## Fase A — Código (FEITO)
- Storage pluggável (Blob em produção, disco em dev) — `lib/storage.ts`.
- Prisma com engine Linux (`binaryTargets` debian) + Windows.
- `start:prod` = `prisma migrate deploy && next start` na porta do Azure. `postinstall` gera o Prisma.
- SDK `@azure/storage-blob` instalado.

## Fase B — Criar recursos (portal.azure.com)

### B1. Resource Group
Criar recurso → **Resource group** `rg-gpoliticas`, região **Brazil South**.

### B2. Azure Database for PostgreSQL — Flexible Server
- Nome: `gpoliticas-db` · Região Brazil South · PostgreSQL 16.
- Tipo de carga: **Development** (Burstable **B1ms**) — barato.
- Autenticação: PostgreSQL. Usuário admin + senha forte (**anote**).
- Rede: **Public access** → marque **Allow public access from any Azure service within Azure** (para o App Service alcançar).
- Após criar: em **Databases**, crie o banco `gpoliticas`.
- Connection string (formato para o `.env`/App settings):
  `postgresql://USUARIO:SENHA@gpoliticas-db.postgres.database.azure.com:5432/gpoliticas?sslmode=require`

### B3. Storage Account (documentos)
- Nome: `stgpoliticasaah` (minúsculo, único) · Brazil South · Standard · LRS.
- Após criar → **Containers** → novo container `documentos` (acesso **Private**).
- **Access keys** → copie a **Connection string**.

### B4. App Service
- Criar → **Web App**: nome `gpoliticas-aahbrant` · Publish **Code** · Runtime **Node 20 LTS** · SO **Linux** · Brazil South · Plano **B1**.
- Grupo: `rg-gpoliticas`.

## Fase C — Configurar o App Service

### C1. App settings (Configuration → Application settings)
| Nome | Valor |
|---|---|
| DATABASE_URL | (connection string do B2, com `?sslmode=require`) |
| AZURE_AD_TENANT_ID | (do `.env`) |
| AZURE_AD_CLIENT_ID | 1b98db67-5ce0-469e-aea3-8beaf8044b87 |
| AZURE_AD_CLIENT_SECRET | (do `.env`) |
| AZURE_AD_APP_ID_URI | api://1b98db67-5ce0-469e-aea3-8beaf8044b87 |
| AUTH_SECRET | (do `.env`) |
| APP_BASE_URL | https://gpoliticas-aahbrant.azurewebsites.net |
| ADMIN_EMAILS | wellington.lourenco@aahbrant.com |
| AZURE_STORAGE_CONNECTION_STRING | (do B3) |
| AZURE_STORAGE_CONTAINER | documentos |
| SCM_DO_BUILD_DURING_DEPLOYMENT | true |

### C2. Startup Command (Configuration → General settings)
`npm run start:prod`

### C3. Azure AD — redirect URI
App registration → Authentication → Web → Add URI:
`https://gpoliticas-aahbrant.azurewebsites.net/api/auth/callback`

## Fase D — Deploy pelo VS Code
1. Extensões → instale **Azure App Service** (Microsoft).
2. Ícone do Azure → **Sign in**.
3. **NÃO** enviar `.env` nem `uploads/` (as settings do App Service mandam). Confirme que estão no `.gitignore`/ignore de deploy.
4. Botão direito na pasta `g-politicas-app` → **Deploy to Web App…** → escolha `gpoliticas-aahbrant` → confirme o build remoto (Oryx faz `npm install` + `next build`).
5. 1º start roda `prisma migrate deploy` (cria o schema no Postgres do Azure).

## Fase E — Teams com a URL real
1. Em `teams/manifest.json`, troque a URL do túnel por `gpoliticas-aahbrant.azurewebsites.net` (staticTabs, validDomains, developer).
2. Recompacte o zip e re-sideload no Teams. SSO entra liso (sem interstitial de túnel).

## Verificação pós-deploy
- Abrir `https://gpoliticas-aahbrant.azurewebsites.net` → login Entra.
- Criar política → publicar → upload (vai pro Blob) → baixar.
- Log Stream (App Service → Monitoring) mostra erros de runtime.
