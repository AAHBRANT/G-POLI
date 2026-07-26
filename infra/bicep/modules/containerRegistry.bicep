// Azure Container Registry — imagens Docker do g-políticas.
// Baseline hml: acrgpolhml27207f (Basic, admin user habilitado).
@description('Nome do registry (5-50 chars alfanuméricos).')
param name string

@description('Região.')
param location string

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: name
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    // adminUser habilitado: o Container App puxa a imagem via usuário/senha do
    // ACR (passwordSecretRef), não via managed identity. É débito consciente —
    // ver "Known Technical Debt" no README. Reproduzido fielmente (não melhorar).
    adminUserEnabled: true
  }
}

output id string = acr.id
output loginServer string = acr.properties.loginServer
output name string = acr.name
