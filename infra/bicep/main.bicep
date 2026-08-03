// ============================================================================
// G-Políticas — Infraestrutura (baseline)
// ----------------------------------------------------------------------------
// Escopo: resource group. Reproduz a stack hml existente em rg-gpoliticas.
// Princípio: reproduce-not-improve — capturar o que já roda, não redesenhar.
// Melhorias identificadas ficam documentadas no README (Known Technical Debt),
// não aplicadas aqui.
// ============================================================================
targetScope = 'resourceGroup'

@description('Região principal dos recursos (baseline: brazilsouth).')
param location string = resourceGroup().location

@description('Região do Azure OpenAI (baseline: eastus2, onde há quota do modelo).')
param openAiLocation string = 'eastus2'

// ---- Nomes dos recursos (parametrizados p/ reproduzir o baseline exato) ----
param logAnalyticsName string
param storageName string
param acrName string
param postgresName string
param containerEnvName string
param containerAppName string
param containerAppJobName string
param openAiName string
param openAiCustomSubDomain string

// ---- Config do app ----
param image string
param postgresAdminLogin string
param aadTenantId string
param aadClientId string
param aadAppIdUri string
param adminEmails string
param storageContainer string
param appBaseUrl string
param openAiDeployment string
param openAiApiVersion string
param acessoAberto string = '1'
param dominiosOrg string = 'aahbrant.com'
param cronExpression string = '0 3 * * *'

// ---- Secrets (passados em deploy; nunca versionados) ----
@secure()
param postgresAdminPassword string
@secure()
param dbUrl string
@secure()
param authSecret string
@secure()
param aadClientSecret string
@secure()
param storageConnectionString string
@secure()
param openAiKey string
@secure()
param cronSecret string
@secure()
param acrPassword string
@description('Usuário admin do ACR (default = nome do ACR, padrão do Azure).')
param acrUsername string

// ---------------------------------------------------------------------------
// Módulos (ordem = dependências implícitas via outputs)
// ---------------------------------------------------------------------------
module logAnalytics 'modules/logAnalytics.bicep' = {
  name: 'logAnalytics'
  params: {
    name: logAnalyticsName
    location: location
  }
}

module storage 'modules/storageAccount.bicep' = {
  name: 'storage'
  params: {
    name: storageName
    location: location
  }
}

module acr 'modules/containerRegistry.bicep' = {
  name: 'acr'
  params: {
    name: acrName
    location: location
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    name: postgresName
    location: location
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
  }
}

module containerEnv 'modules/containerEnv.bicep' = {
  name: 'containerEnv'
  params: {
    name: containerEnvName
    location: location
    logAnalyticsCustomerId: logAnalytics.outputs.customerId
    logAnalyticsSharedKey: logAnalytics.outputs.primarySharedKey
  }
}

module openai 'modules/openai.bicep' = {
  name: 'openai'
  params: {
    name: openAiName
    location: openAiLocation
    customSubDomainName: openAiCustomSubDomain
    deploymentName: openAiDeployment
  }
}

module containerApp 'modules/containerApp.bicep' = {
  name: 'containerApp'
  params: {
    name: containerAppName
    location: location
    environmentId: containerEnv.outputs.id
    acrLoginServer: acr.outputs.loginServer
    acrUsername: acrUsername
    acrPassword: acrPassword
    image: image
    aadTenantId: aadTenantId
    aadClientId: aadClientId
    aadAppIdUri: aadAppIdUri
    adminEmails: adminEmails
    storageContainer: storageContainer
    appBaseUrl: appBaseUrl
    openAiEndpoint: openai.outputs.endpoint
    openAiDeployment: openAiDeployment
    openAiApiVersion: openAiApiVersion
    acessoAberto: acessoAberto
    dominiosOrg: dominiosOrg
    dbUrl: dbUrl
    authSecret: authSecret
    aadClientSecret: aadClientSecret
    storageConnectionString: storageConnectionString
    openAiKey: openAiKey
    cronSecret: cronSecret
  }
}

module lembretesJob 'modules/containerAppJob.bicep' = {
  name: 'lembretesJob'
  params: {
    name: containerAppJobName
    location: location
    environmentId: containerEnv.outputs.id
    acrLoginServer: acr.outputs.loginServer
    acrUsername: acrUsername
    acrPassword: acrPassword
    image: image
    appBaseUrl: appBaseUrl
    cronSecret: cronSecret
    cronExpression: cronExpression
  }
}

output appFqdn string = containerApp.outputs.fqdn
output acrLoginServer string = acr.outputs.loginServer
output postgresFqdn string = postgres.outputs.fqdn
output openAiEndpoint string = openai.outputs.endpoint
