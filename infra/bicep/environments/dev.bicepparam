// Parâmetros do ambiente DEV — TEMPLATE.
// A stack de dev ainda não existe no Azure. Preencher os nomes/valores antes
// do primeiro deploy. Secrets sempre via variável de ambiente (nunca no repo).
using '../main.bicep'

param location = 'brazilsouth'
param openAiLocation = 'eastus2'

// TODO: definir nomes de dev (sufixo próprio, sem colidir com hml).
param logAnalyticsName = 'log-gpol-dev-brazilsouth'
param storageName = 'stgpoldevXXXXX'
param acrName = 'acrgpoldevXXXXX'
param postgresName = 'gpoliticas-db-dev'
param containerEnvName = 'cae-gpol-dev-brazilsouth'
param containerAppName = 'ca-gpol-dev-aahbrant'
param containerAppJobName = 'caj-gpol-dev-lembretes'
param openAiName = 'oai-gpol-dev-XXXXX'
param openAiCustomSubDomain = 'oai-gpol-dev-XXXXX'

param image = 'acrgpoldevXXXXX.azurecr.io/gpoliticas:dev'
param postgresAdminLogin = 'gpoladmin'
param acrUsername = 'acrgpoldevXXXXX'
param aadTenantId = '8cc518ea-6df8-4d1e-a79f-89ee9314335c'
param aadClientId = '' // TODO: app registration de dev
param aadAppIdUri = '' // TODO
param adminEmails = 'wellington.lourenco@aahbrant.com'
param storageContainer = 'documentos'
param appBaseUrl = '' // TODO: preencher após 1º deploy (FQDN do Container App)
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
