// Log Analytics Workspace — destino dos logs do Container Apps Environment.
// Baseline hml: log-gpol-hml-brazilsouth (PerGB2018, retenção 30 dias).
@description('Nome do workspace.')
param name string

@description('Região.')
param location string

@description('Dias de retenção de logs. Baseline: 30.')
param retentionInDays int = 30

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  properties: {
    // PerGB2018 é o único SKU de ingestão atual; pay-as-you-go por GB.
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
  }
}

output id string = workspace.id
output customerId string = workspace.properties.customerId
// A primary shared key é necessária para o appLogsConfiguration do CAE.
#disable-next-line outputs-should-not-contain-secrets
output primarySharedKey string = workspace.listKeys().primarySharedKey
