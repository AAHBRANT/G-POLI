// infra/bicep/modules/containerAppJob.bicep
//
// Job agendado (cron) que dispara a rota protegida /api/cron/lembretes-pendencia
// do Container App já existente — não roda lógica própria, só um fetch (ver
// jobs/lembretes-pendencia.js). Mesma imagem do Container App.

@description('Nome do Container Apps Job.')
param name string

@description('Região.')
param location string

@description('Resource ID do managed environment.')
param environmentId string

@description('Login server do ACR.')
param acrLoginServer string

@description('Usuário do ACR (admin user).')
param acrUsername string

@secure()
@description('Senha do ACR (admin user).')
param acrPassword string

@description('Imagem completa (mesma do Container App).')
param image string

@description('APP_BASE_URL — o job monta a URL da rota protegida a partir daqui.')
param appBaseUrl string

@secure()
@description('CRON_SECRET — mesmo valor configurado no Container App.')
param cronSecret string

@description('Expressão cron (UTC). Baseline: 03:00 diário.')
param cronExpression string = '0 3 * * *'

var acrPasswordSecretName = 'acrpassword'
var cronSecretName = 'cronsecret'

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: name
  location: location
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 300
      // 0, não 1: o guard de idempotência da rota é "ler estado, decidir,
      // gravar estado" — não é uma atualização condicional atômica. Um retry
      // disparado enquanto a 1ª réplica ainda está no meio do loop pode
      // reenviar lembretes para pendências ainda não gravadas. A rota já
      // trata os próprios erros internamente (best-effort, nunca lança), então
      // um retry não recupera nada de real — só abre uma janela de duplicidade.
      // Uma falha de HTTP do script de disparo deve aparecer como run falho no
      // Azure, não virar reenvio automático.
      replicaRetryLimit: 0
      registries: [
        { server: acrLoginServer, username: acrUsername, passwordSecretRef: acrPasswordSecretName }
      ]
      secrets: [
        { name: acrPasswordSecretName, value: acrPassword }
        { name: cronSecretName, value: cronSecret }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: image
          command: ['node', 'jobs/lembretes-pendencia.js']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'APP_BASE_URL', value: appBaseUrl }
            { name: 'CRON_SECRET', secretRef: cronSecretName }
          ]
        }
      ]
    }
  }
}

output name string = job.name
