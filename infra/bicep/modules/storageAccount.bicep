// Storage Account — uploads de documentos das políticas (Blob).
// Baseline hml: stgpolje6xi (StorageV2, Standard_LRS, Hot, TLS 1.2, HTTPS-only).
@description('Nome da conta (3-24 chars, minúsculas/dígitos).')
param name string

@description('Região.')
param location string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  // Standard_LRS: redundância local. Suficiente para hml; prod deve reavaliar
  // (ver "Known Technical Debt" no README).
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

output id string = storage.id
output name string = storage.name
