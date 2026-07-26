// PostgreSQL Flexible Server — banco do g-políticas (Prisma).
// Baseline hml: gpoliticas-db-je6xi (B1ms/Burstable, v16, 32GB Premium P4,
// backup 7d não-geo, HA off, rede pública, auth por senha).
@description('Nome do servidor.')
param name string

@description('Região.')
param location string

@description('Usuário administrador.')
param administratorLogin string

@secure()
@description('Senha do administrador. Passada em deploy (nunca versionada).')
param administratorLoginPassword string

@description('Versão do PostgreSQL. Baseline: 16.')
param version string = '16'

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  // Standard_B1ms (Burstable): menor SKU viável, adequado a hml. Prod deve
  // subir para General Purpose (ver "Known Technical Debt").
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: version
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: 32
      // autoGrow off: reproduz o baseline. Risco de encher — monitorar.
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    // Rede pública habilitada, sem VNet/private endpoint. Débito consciente de
    // hml (acesso simples). Prod deve usar delegated subnet + private DNS.
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
  }
}

// Regra de firewall que libera serviços do Azure (0.0.0.0). Necessária porque a
// rede é pública e o Container App sai por IP dinâmico do Azure.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: pg
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output id string = pg.id
output fqdn string = pg.properties.fullyQualifiedDomainName
output name string = pg.name
