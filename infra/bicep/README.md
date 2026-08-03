# Infraestrutura — G-Políticas (Bicep baseline)

Infraestrutura como código do g-políticas. Este baseline **reproduz** a stack
que já roda em `rg-gpoliticas` (ambiente hml) — princípio **reproduce-not-improve**:
capturar o que existe, não redesenhar. Melhorias identificadas estão listadas em
[Known Technical Debt](#known-technical-debt), **documentadas e não aplicadas**.

Documento vivo: ao mudar a infra, atualize este README na mesma mudança.

## Topologia (rg-gpoliticas, hml)

| Recurso | Nome (hml) | SKU / config | Região |
|---|---|---|---|
| Log Analytics | `log-gpol-hml-brazilsouth` | PerGB2018, 30d | brazilsouth |
| Storage Account | `stgpolje6xi` | StorageV2, Standard_LRS, Hot | brazilsouth |
| Container Registry | `acrgpolhml27207f` | Basic, admin on | brazilsouth |
| PostgreSQL Flexible | `gpoliticas-db-je6xi` | B1ms/Burstable, v16, 32GB P4 | brazilsouth |
| Container Apps Env | `cae-gpol-hml-brazilsouth` | Consumption, logs→LA | brazilsouth |
| Container App | `ca-gpol-hml-aahbrant` | 0.5vCPU/1Gi, scale 1-1, :3000 | brazilsouth |
| Container Apps Job | `caj-gpol-hml-lembretes` | 0.25vCPU/0.5Gi, cron `0 3 * * *` | brazilsouth |
| Azure OpenAI | `oai-gpol-hml-27207f` | S0; `gpt5mini`=gpt-5.4-mini | eastus2 |

Ordem de dependência: Log Analytics → Container Env; ACR → Container App;
OpenAI → Container App (endpoint). O `main.bicep` resolve via outputs.

## Estrutura

```
infra/bicep/
├── main.bicep                  # orquestrador (escopo: resource group)
├── modules/
│   ├── logAnalytics.bicep
│   ├── storageAccount.bicep
│   ├── containerRegistry.bicep
│   ├── postgres.bicep
│   ├── containerEnv.bicep
│   ├── openai.bicep
│   └── containerApp.bicep
└── environments/
    ├── hml.bicepparam          # valores reais do baseline
    ├── dev.bicepparam          # template (stack não existe ainda)
    └── prod.bicepparam         # template (rever débitos antes de subir)
```

## Como validar (sem aplicar)

```bash
az bicep build --file infra/bicep/main.bicep
```

```bash
az deployment group what-if \
  --resource-group rg-gpoliticas \
  --parameters infra/bicep/environments/hml.bicepparam
```

O `what-if` contra `rg-gpoliticas` deve mostrar **near-zero drift** (o baseline
reproduz o que já existe). Diferenças esperadas estão em
[Desvios conscientes](#desvios-conscientes-do-baseline).

## Como aplicar

Secrets **nunca** ficam no repo. Exporte as variáveis antes do deploy:

```bash
export GPOL_PG_PASSWORD=...        GPOL_DB_URL=...
export GPOL_AUTH_SECRET=...        GPOL_AAD_CLIENT_SECRET=...
export GPOL_STORAGE_CONN=...       GPOL_OPENAI_KEY=...
export GPOL_ACR_PASSWORD=...       GPOL_CRON_SECRET=...
az deployment group create \
  --resource-group rg-gpoliticas \
  --parameters infra/bicep/environments/hml.bicepparam \
  --parameters cronSecret=$GPOL_CRON_SECRET
```

## Known Technical Debt

Separado entre **consciente** (escolha deliberada, aceita por ora) e
**acidental** (não intencional, corrigir quando possível).

### Débito consciente (deliberado — MVP/hml)
- **Postgres com rede pública** (`publicNetworkAccess: Enabled`, firewall
  `0.0.0.0`). Simplicidade de hml. **Prod:** VNet + delegated subnet + private
  DNS, sem exposição pública.
- **Secrets no Container App**, não em Key Vault. **Prod:** Key Vault +
  referências `keyvaultref`.
- **Pull de imagem por admin user do ACR** (usuário/senha), identity `None`.
  **Prod:** managed identity + `AcrPull` role, `adminUserEnabled: false`.
- **Single replica** (`min=max=1`, sem regras de escala). Evita cold start mas
  não escala nem tolera falha de instância. **Prod:** min≥2 + regras (HTTP/CPU).
- **SKUs mínimos:** Postgres B1ms Burstable, Storage LRS, ACR Basic, sem
  zone-redundancy, HA off, backup não-geo. **Prod:** General Purpose, GRS/ZRS,
  HA habilitado.
- **`autoGrow: Disabled`** no Postgres — risco de encher os 32GB. Monitorar.
- **Agente de CI self-hosted** (fora deste Bicep) — ver
  [ADR-002](../../docs/adr/ADR-002-agente-selfhosted-ci.md).
- **Container Apps Job dispara a rota via HTTP, não roda lógica própria** —
  decisão deliberada (ver spec da Fase D): o output standalone do Next não
  inclui scripts soltos, então a lógica mora numa rota de API já rastreada
  pelo build; o Job só faz 1 fetch autenticado por secret.

### Desvios conscientes do baseline
- **OpenAI em `eastus2`** (resto em `brazilsouth`): forçado pela
  disponibilidade/quota do modelo `gpt-5.4-mini` (DataZoneStandard). Não é
  acidente — cross-region assumido.
- **Nome do secret da senha do ACR:** o baseline usa o nome auto-gerado pelo
  Azure CLI (`...azurecrio-...`); o módulo usa `acrpassword` (legível). Único
  desvio cosmético — um `what-if` pode acusar rename do secret.

### Débito acidental (corrigir)
- **Nomes inconsistentes:** alguns recursos têm sufixo de região
  (`-hml-brazilsouth`), outros sufixo aleatório (`je6xi`, `27207f`). Padronizar
  convenção de nomes em dev/prod.
- **`api-version` do OpenAI hardcoded** (`2025-04-01-preview`) no app e no
  param — acoplamento a uma preview. Revisar ao estabilizar.

## Fora de escopo deste baseline
Este Bicep descreve a infra **do próprio g-políticas** (infra de módulo). A
camada de plataforma compartilhada (event bus, AI gateway, knowledge layer) —
quando extraída — vai para um repositório `platform-infrastructure` separado,
conforme o princípio platform-by-extraction. Ver
[ADR-001](../../docs/adr/ADR-001-plataforma-corporativa.md).
