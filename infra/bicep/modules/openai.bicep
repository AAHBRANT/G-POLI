// Azure OpenAI (Cognitive Services) — gerador de rascunho de norma.
// Baseline hml: oai-gpol-hml-27207f (kind OpenAI, S0, eastus2) com deployment
// gpt5mini = gpt-5.4-mini DataZoneStandard, cap 50.
// NOTA: fica em eastus2 (não brazilsouth) porque o modelo/quota está lá.
// Isso é consciente, não acidental (ver "Known Technical Debt").
@description('Nome da conta Cognitive Services.')
param name string

@description('Região do OpenAI (baseline: eastus2).')
param location string

@description('Subdomínio customizado (exigido para endpoint dedicado).')
param customSubDomainName string

@description('Nome do deployment. Baseline: gpt5mini.')
param deploymentName string = 'gpt5mini'

@description('Modelo. Baseline: gpt-5.4-mini.')
param modelName string = 'gpt-5.4-mini'

@description('Versão do modelo. Baseline: 2026-03-17.')
param modelVersion string = '2026-03-17'

@description('Capacidade (mil tokens/min). Baseline: 50.')
param capacity int = 50

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: customSubDomainName
    publicNetworkAccess: 'Enabled'
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: deploymentName
  sku: {
    // DataZoneStandard: escolhido porque GlobalStandard estava com quota 0 para
    // o modelo (ver histórico de deploy). Reproduzido fielmente.
    name: 'DataZoneStandard'
    capacity: capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
  }
}

output id string = account.id
output endpoint string = account.properties.endpoint
output deploymentName string = deployment.name
