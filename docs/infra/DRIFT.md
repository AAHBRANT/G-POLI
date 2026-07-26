# Relatório de Drift — Infraestrutura G-Políticas

Referência oficial da fidelidade entre o Bicep (`infra/bicep/`) e o ambiente
que roda em `rg-gpoliticas` (hml).

- **Data:** 2026-07-26
- **Comando:** `az deployment group what-if -g rg-gpoliticas --parameters infra/bicep/environments/hml.bicepparam`
- **Modo:** Incremental (padrão do what-if)
- **Commit do Bicep:** `bacaab9` (PR #8)
- **Resultado bruto:** 3 NoChange · 5 Modify · 1 Create

## Veredito

✅ **Baseline HOMOLOGADO.** Todas as diferenças se enquadram em *nomes internos,
timestamps ou propriedades gerenciadas pela Azure* — nenhuma representa drift de
configuração real. Ressalvas de **cobertura** (2 sub-recursos não modelados)
estão registradas abaixo para transparência; não invalidam o baseline dos 7
recursos de topo.

## Recursos iguais (NoChange)

| Recurso | Tipo |
|---|---|
| `log-gpol-hml-brazilsouth` | Log Analytics |
| `stgpolje6xi` | Storage Account |
| `oai-gpol-hml-27207f` | Azure OpenAI (conta) |

## Recursos diferentes (Modify) — só ruído esperado

Nenhum delta é configuração real divergente. Categorias:

| Recurso | Diferenças | Natureza |
|---|---|---|
| `ca-gpol-hml-aahbrant` (Container App) | `exposedPort`, `maxInactiveRevisions`, `runningStatus`, `workloadProfileName` removidos; `registries.server` e `env[OPENAI_ENDPOINT]` viram expressão `reference()`; nomes/ordem de secrets | Props gerenciadas pela Azure (read-only/default) + artefatos de `reference()` que resolvem idêntico no deploy + rename intencional (ver abaixo) |
| `cae-gpol-hml-brazilsouth` (Container Env) | `customerId` vira `reference()`; `peerAuthentication`, `peerTrafficConfiguration` removidos | Artefato de `reference()` + defaults gerenciados |
| `gpt5mini` (OpenAI deployment) | `currentCapacity`, `raiPolicyName`, `versionUpgradeOption` removidos | Defaults/valores gerenciados pela Azure |
| `acrgpolhml27207f` (ACR) | `dataEndpointEnabled`, `encryption` removidos | Defaults gerenciados |
| `gpoliticas-db-je6xi` (Postgres) | `dataEncryption`, `replica`, `replicationRole`, `storage.iops/tier/type` removidos | Read-only + storage tier/iops derivados do tamanho (32GB → P4/120 IOPS/Premium_LRS) |

> **Sobre `reference()`:** o what-if não resolve expressões de runtime, então
> mostra a expressão no "after" e o valor literal no "before". No deploy real
> ambas resolvem para o mesmo valor. Não é drift.

## Recursos criados (Create)

| Recurso | Situação |
|---|---|
| `flexibleServers/.../firewallRules/AllowAllAzureServicesAndResourcesWithinAzureIps` | A regra **já existe** no servidor com a mesma faixa (`0.0.0.0`–`0.0.0.0`), porém com nome timestampado: `AllowAllAzureServicesAndResourcesWithinAzureIps_2026-7-24_13-27-3` (gerado pelo toggle "Allow Azure services" do portal). O Bicep usa nome determinístico. Semântica idêntica; rename cosmético. |

## Diferenças intencionais

Desvios deliberados, aceitos e documentados (não são drift):

1. **Nome do secret da senha do ACR:** baseline usa `acrpassword`; o recurso
   real tem o nome auto-gerado `acrgpolhml27207fazurecrio-acrgpolhml27207f`.
   Escolha por legibilidade.
2. **Nome da firewall rule:** determinístico vs timestampado (ver Create).
3. **Expressões `reference()`** para `loginServer`, `customerId` e endpoint do
   OpenAI — acoplamento correto entre módulos; resolvem no valor atual.

## Recursos não representados (gaps de cobertura)

Existem no ambiente mas **não estão modelados** no Bicep. Não são drift dos
recursos de topo, mas lacunas de cobertura a fechar em PR futuro (fora do
escopo atual — sem melhorias antes da fundação validada):

| Item | Onde | Observação |
|---|---|---|
| Container de blob `documentos` | dentro de `stgpolje6xi` | Usado por `AZURE_STORAGE_CONTAINER`. Sub-recurso `blobServices/containers` não declarado. |
| Database `gpoliticas` | dentro de `gpoliticas-db-je6xi` | Alvo do `DATABASE_URL`. Criado fora do IaC; schema via Prisma migrate. |

## Como reproduzir este relatório

```bash
export GPOL_PG_PASSWORD=dummy GPOL_DB_URL=dummy GPOL_AUTH_SECRET=dummy \
       GPOL_AAD_CLIENT_SECRET=dummy GPOL_STORAGE_CONN=dummy \
       GPOL_OPENAI_KEY=dummy GPOL_ACR_PASSWORD=dummy
az deployment group what-if \
  -g rg-gpoliticas \
  --parameters infra/bicep/environments/hml.bicepparam
```

Valores dummy nos secrets não afetam o diff: o what-if trata secure strings como
write-only (a Azure não expõe o valor atual para comparação).
