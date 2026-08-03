// Parâmetros do ambiente HML — reproduz a stack existente em rg-gpoliticas.
// Valores não-secretos: literais (fidelidade ao baseline).
// Valores secretos: lidos de variáveis de ambiente no momento do deploy
// (readEnvironmentVariable) — NUNCA versionados no repositório.
using '../main.bicep'

// ---- Regiões ----
param location = 'brazilsouth'
param openAiLocation = 'eastus2'

// ---- Nomes (exatos do baseline hml) ----
param logAnalyticsName = 'log-gpol-hml-brazilsouth'
param storageName = 'stgpolje6xi'
param acrName = 'acrgpolhml27207f'
param postgresName = 'gpoliticas-db-je6xi'
param containerEnvName = 'cae-gpol-hml-brazilsouth'
param containerAppName = 'ca-gpol-hml-aahbrant'
param containerAppJobName = 'caj-gpol-hml-lembretes'
param openAiName = 'oai-gpol-hml-27207f'
param openAiCustomSubDomain = 'oai-gpol-hml-27207f'

// ---- App ----
param image = 'acrgpolhml27207f.azurecr.io/gpoliticas:v4'
param postgresAdminLogin = 'gpoladmin'
param acrUsername = 'acrgpolhml27207f'
param aadTenantId = '8cc518ea-6df8-4d1e-a79f-89ee9314335c'
param aadClientId = '1b98db67-5ce0-469e-aea3-8beaf8044b87'
param aadAppIdUri = 'api://1b98db67-5ce0-469e-aea3-8beaf8044b87'
param adminEmails = 'wellington.lourenco@aahbrant.com'
param storageContainer = 'documentos'
param appBaseUrl = 'https://ca-gpol-hml-aahbrant.whitesmoke-8dee35f8.brazilsouth.azurecontainerapps.io'
param openAiDeployment = 'gpt5mini'
param openAiApiVersion = '2025-04-01-preview'
param acessoAberto = '1'
param dominiosOrg = 'aahbrant.com'

// ---- Secrets (exportar as variáveis antes de `az deployment ... `) ----
param postgresAdminPassword = readEnvironmentVariable('GPOL_PG_PASSWORD')
param dbUrl = readEnvironmentVariable('GPOL_DB_URL')
param authSecret = readEnvironmentVariable('GPOL_AUTH_SECRET')
param aadClientSecret = readEnvironmentVariable('GPOL_AAD_CLIENT_SECRET')
param storageConnectionString = readEnvironmentVariable('GPOL_STORAGE_CONN')
param openAiKey = readEnvironmentVariable('GPOL_OPENAI_KEY')
param acrPassword = readEnvironmentVariable('GPOL_ACR_PASSWORD')
