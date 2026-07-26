// Container Apps Environment — plano de execução do Container App.
// Baseline hml: cae-gpol-hml-brazilsouth (perfil Consumption, logs para Log
// Analytics, sem zone-redundancy).
@description('Nome do environment.')
param name string

@description('Região.')
param location string

@description('customerId (workspaceId) do Log Analytics.')
param logAnalyticsCustomerId string

@secure()
@description('Shared key do Log Analytics.')
param logAnalyticsSharedKey string

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    // Perfil Consumption puro (serverless, escala a zero). Sem zone-redundancy
    // em hml — prod deve avaliar (ver "Known Technical Debt").
    zoneRedundant: false
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

output id string = env.id
output name string = env.name
