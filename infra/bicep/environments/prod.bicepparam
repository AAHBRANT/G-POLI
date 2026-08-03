// Parâmetros do ambiente PROD — TEMPLATE.
// A stack de prod ainda não existe. Antes de subir prod, revisar os itens de
// "Known Technical Debt" no README — vários débitos conscientes de hml NÃO
// devem ser reproduzidos em produção (rede pública do Postgres, single replica,
// SKUs mínimos, secrets fora de Key Vault, pull de imagem por admin user).
using '../main.bicep'

param location = 'brazilsouth'
param openAiLocation = 'eastus2'

// TODO: definir nomes de prod.
param logAnalyticsName = 'log-gpol-prod-brazilsouth'
param storageName = 'stgpolprodXXXXX'
param acrName = 'acrgpolprodXXXXX'
param postgresName = 'gpoliticas-db-prod'
param containerEnvName = 'cae-gpol-prod-brazilsouth'
param containerAppName = 'ca-gpol-prod-aahbrant'
param containerAppJobName = 'caj-gpol-prod-lembretes'
param openAiName = 'oai-gpol-prod-XXXXX'
param openAiCustomSubDomain = 'oai-gpol-prod-XXXXX'

param image = 'acrgpolprodXXXXX.azurecr.io/gpoliticas:vX'
param postgresAdminLogin = 'gpoladmin'
param acrUsername = 'acrgpolprodXXXXX'
param aadTenantId = '8cc518ea-6df8-4d1e-a79f-89ee9314335c'
param aadClientId = '' // TODO: app registration de prod
param aadAppIdUri = '' // TODO
param adminEmails = 'wellington.lourenco@aahbrant.com'
param storageContainer = 'documentos'
param appBaseUrl = '' // TODO: domínio de produção
param openAiDeployment = 'gpt5mini'
param openAiApiVersion = '2025-04-01-preview'
param acessoAberto = '1'
param dominiosOrg = 'aahbrant.com'

param postgresAdminPassword = readEnvironmentVariable('GPOL_PG_PASSWORD')
param dbUrl = readEnvironmentVariable('GPOL_DB_URL')
param authSecret = readEnvironmentVariable('GPOL_AUTH_SECRET')
param aadClientSecret = readEnvironmentVariable('GPOL_AAD_CLIENT_SECRET')
param storageConnectionString = readEnvironmentVariable('GPOL_STORAGE_CONN')
param openAiKey = readEnvironmentVariable('GPOL_OPENAI_KEY')
param acrPassword = readEnvironmentVariable('GPOL_ACR_PASSWORD')
param cronSecret = readEnvironmentVariable('GPOL_CRON_SECRET')
