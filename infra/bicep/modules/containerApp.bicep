// Container App — o app Next.js do g-políticas em execução.
// Baseline hml: ca-gpol-hml-aahbrant (img gpoliticas:v4, 0.5 vCPU / 1Gi,
// scale 1-1, ingress externo :3000, 6 secrets, 16 env vars, identity None).
//
// reproduce-not-improve: os secrets são armazenados como secrets do próprio
// Container App (não Key Vault) e a imagem é puxada via usuário/senha do ACR
// (não managed identity). Ambos são débito consciente — ver README.

@description('Nome do Container App.')
param name string

@description('Região.')
param location string

@description('Resource ID do managed environment.')
param environmentId string

@description('Login server do ACR (ex.: xxx.azurecr.io).')
param acrLoginServer string

@description('Usuário do ACR (admin user).')
param acrUsername string

@secure()
@description('Senha do ACR (admin user).')
param acrPassword string

@description('Imagem completa (ex.: xxx.azurecr.io/gpoliticas:v4).')
param image string

@description('Porta que o container expõe. Baseline: 3000.')
param targetPort int = 3000

// ---- Env vars não-secretas (valores por ambiente) ----
@description('AZURE_AD_TENANT_ID')
param aadTenantId string
@description('AZURE_AD_CLIENT_ID')
param aadClientId string
@description('AZURE_AD_APP_ID_URI')
param aadAppIdUri string
@description('ADMIN_EMAILS (lista separada por vírgula)')
param adminEmails string
@description('AZURE_STORAGE_CONTAINER')
param storageContainer string
@description('APP_BASE_URL (FQDN público do app)')
param appBaseUrl string
@description('AZURE_OPENAI_ENDPOINT')
param openAiEndpoint string
@description('AZURE_OPENAI_DEPLOYMENT')
param openAiDeployment string
@description('AZURE_OPENAI_API_VERSION')
param openAiApiVersion string
@description('ACESSO_ABERTO ("1" = aberto ao domínio)')
param acessoAberto string = '1'
@description('DOMINIOS_ORG (domínios liberados)')
param dominiosOrg string = 'aahbrant.com'

// ---- Secrets (todos @secure, passados em deploy) ----
@secure()
@description('DATABASE_URL (conexão Prisma/Postgres)')
param dbUrl string
@secure()
@description('AUTH_SECRET (assinatura do cookie de sessão)')
param authSecret string
@secure()
@description('AZURE_AD_CLIENT_SECRET')
param aadClientSecret string
@secure()
@description('AZURE_STORAGE_CONNECTION_STRING')
param storageConnectionString string
@secure()
@description('AZURE_OPENAI_KEY')
param openAiKey string

// Nome do secret que guarda a senha do ACR (padrão gerado pelo Azure ao criar
// via CLI). Mantido igual ao baseline para fidelidade.
var acrPasswordSecretName = 'acrpassword'

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  // identity None: reproduz o baseline (pull via admin user do ACR).
  identity: {
    type: 'None'
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'Auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: acrPasswordSecretName
        }
      ]
      secrets: [
        { name: acrPasswordSecretName, value: acrPassword }
        { name: 'dburl', value: dbUrl }
        { name: 'authsecret', value: authSecret }
        { name: 'clientsecret', value: aadClientSecret }
        { name: 'stgconn', value: storageConnectionString }
        { name: 'openaikey', value: openAiKey }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'dburl' }
            { name: 'AZURE_AD_TENANT_ID', value: aadTenantId }
            { name: 'AZURE_AD_CLIENT_ID', value: aadClientId }
            { name: 'AZURE_AD_CLIENT_SECRET', secretRef: 'clientsecret' }
            { name: 'AZURE_AD_APP_ID_URI', value: aadAppIdUri }
            { name: 'AUTH_SECRET', secretRef: 'authsecret' }
            { name: 'ADMIN_EMAILS', value: adminEmails }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'stgconn' }
            { name: 'AZURE_STORAGE_CONTAINER', value: storageContainer }
            { name: 'APP_BASE_URL', value: appBaseUrl }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
            { name: 'AZURE_OPENAI_KEY', secretRef: 'openaikey' }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: openAiDeployment }
            { name: 'AZURE_OPENAI_API_VERSION', value: openAiApiVersion }
            { name: 'ACESSO_ABERTO', value: acessoAberto }
            { name: 'DOMINIOS_ORG', value: dominiosOrg }
          ]
          // Probes de saúde (ver docs/DEPLOY.md). Batem em /api/health (público).
          // - Startup: dá tempo de migrate+boot antes de liveness valer
          //   (30×5s = 150s). Se nunca ficar pronto, a revisão nova falha e a
          //   anterior continua servindo.
          // - Readiness: controla o tráfego — só recebe requisição quando OK.
          // - Liveness: reinicia o container se travar depois de no ar.
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/api/health', port: targetPort }
              initialDelaySeconds: 5
              periodSeconds: 5
              failureThreshold: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: targetPort }
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: targetPort }
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      // scale 1-1: sem escala a zero (evita cold start) e sem escala horizontal.
      // Débito consciente de hml — ver README.
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output name string = app.name
