# Deploy & Migração — G-Políticas (especificação operacional)

Se o [`DOMINIO.md`](DOMINIO.md) define **o que** o sistema faz, este documento
define **como colocamos isso em produção**. É a referência para qualquer mudança
futura no deploy: alterações em `docker-entrypoint.sh`, no pipeline ou na
estratégia de migração devem justificar-se como *"implementa o DEPLOY.md"*.

Relacionado: [`ADR-002`](adr/ADR-002-agente-selfhosted-ci.md) (agente de CI),
[`CI.md`](CI.md) (operação do agente).

---

## Estado atual

- **Deploy manual:** build da imagem → push no registry → atualização da revisão
  do Container App. **Não há CD** (decisão consciente: CI antes de CD).
- **Migração no startup:** o container roda `prisma migrate deploy` ao subir.
- **Réplica única**; rollback por troca de revisão.

---

## Passo a passo — subir uma nova versão manualmente

Sequência real usada em toda atualização do ambiente de homologação. `vN` é o
próximo número de versão (ex.: se a última foi v11, use v12).

**0. Confirmar que a PR já foi mergeada em `main`**

```bash
git checkout main
git pull --ff-only origin main
git log --oneline -3
```

**1. Build da imagem**

```bash
docker build -t gpoliticas:vN .
```

**2. Smoke test — banco descartável + boot completo**

Confirma que todas as migrações aplicam limpo e o container sobe, antes de ir
pro Azure.

```bash
docker network create gpol-smoke-net

docker run -d --name gpol-smoke-pg --network gpol-smoke-net \
  -e POSTGRES_USER=gpol -e POSTGRES_PASSWORD=gpol_dev -e POSTGRES_DB=gpoliticas \
  postgres:15-alpine

# espera o Postgres aceitar conexão (poucos segundos)
docker exec gpol-smoke-pg pg_isready -U gpol

docker run -d --name gpol-smoke-app --network gpol-smoke-net -p 13000:3000 \
  -e DATABASE_URL="postgresql://gpol:gpol_dev@gpol-smoke-pg:5432/gpoliticas?schema=public" \
  -e AZURE_AD_TENANT_ID="8cc518ea-6df8-4d1e-a79f-89ee9314335c" \
  -e AZURE_AD_CLIENT_ID="1b98db67-5ce0-469e-aea3-8beaf8044b87" \
  -e AZURE_AD_CLIENT_SECRET="dummy" \
  -e AUTH_SECRET="dummy_secret_for_smoke_test_only_1234" \
  -e APP_BASE_URL="http://localhost:13000" \
  -e ADMIN_EMAILS="wellington.lourenco@aahbrant.com" \
  gpoliticas:vN

docker logs gpol-smoke-app
```

Confirme no log: `All migrations have been successfully applied.` e
`✓ Ready in ...`. Depois:

```bash
curl -o /dev/null -w "HTTP %{http_code}\n" http://localhost:13000/
curl -o /dev/null -w "HTTP %{http_code}\n" http://localhost:13000/api/health
```

Esperado: `307` (redireciona pro login, normal sem sessão) e `200`. Se algum
migration falhar aqui, **não** siga pro Azure — corrija primeiro.

Limpeza:

```bash
docker rm -f gpol-smoke-app gpol-smoke-pg
docker network rm gpol-smoke-net
```

**3. Push da imagem pro registry**

```bash
az acr login --name acrgpolhml27207f
docker tag gpoliticas:vN acrgpolhml27207f.azurecr.io/gpoliticas:vN
docker push acrgpolhml27207f.azurecr.io/gpoliticas:vN
```

**4. Atualizar o Container App**

```bash
az containerapp update --name ca-gpol-hml-aahbrant --resource-group rg-gpoliticas \
  --image acrgpolhml27207f.azurecr.io/gpoliticas:vN
```

**5. Verificar a revisão nova**

```bash
az containerapp revision list --name ca-gpol-hml-aahbrant --resource-group rg-gpoliticas \
  --query "[].{name:name, active:properties.active, healthState:properties.healthState, trafficWeight:properties.trafficWeight}" \
  -o table
```

Espere `healthState: Healthy` e `trafficWeight: 100` na revisão nova (pode levar
uns 10-30s — rode o comando de novo se ainda estiver `None`). Se ficar
`Unhealthy`, veja os logs antes de qualquer outra coisa:

```bash
az containerapp logs show --name ca-gpol-hml-aahbrant --resource-group rg-gpoliticas --tail 100
```

**6. Confirmar publicamente**

```bash
curl -o /dev/null -w "HTTP %{http_code}\n" \
  https://ca-gpol-hml-aahbrant.whitesmoke-8dee35f8.brazilsouth.azurecontainerapps.io/
```

`307` = ok (redirect de login).

**Rollback**, se algo der errado depois do deploy: o Container App está em modo
`Single` (uma revisão ativa por vez, sem split de tráfego), então reativar a
revisão anterior (nome da tabela do passo 5) já move 100% do tráfego pra ela:

```bash
az containerapp revision activate --name ca-gpol-hml-aahbrant --resource-group rg-gpoliticas \
  --revision ca-gpol-hml-aahbrant--000000X
```

---

## Fluxo

```
Developer
   │  abre PR
   ▼
Pipeline (CI — agente self-hosted)
   ├── Testes
   ├── TypeScript + Lint
   ├── Build (app + imagem)
   ├── Validação de Bicep
   └── Migration check  ── aplica as migrações num banco descartável e falha se quebrar
   │  merge (pela interface)
   ▼
Deploy (manual hoje; pipeline quando houver CD)
   ▼
Container sobe → prisma migrate deploy
   ├── sucesso → app inicia → health probe OK → passa a receber tráfego
   └── falha   → app NÃO inicia → revisão nova é descartada → revisão anterior segue no ar
```

---

## Decisões do fluxo

**1. Quem executa as migrações**
Hoje: o container, no deploy (startup), disparado pelo deploy manual. Futuro
(com CD): o pipeline, antes de rotear tráfego.

**2. Onde as migrações rodam**
A **aplicação** fica no startup enquanto o deploy for manual — é o único ponto com
acesso ao banco sem CD. A **validação** entra no pipeline desde já (Migration
check), para pegar migração quebrada no PR, não em produção.

**3. Startup é fail-closed**
Se `migrate deploy` falhar, o container **não sobe**. Motivo: com a migração
falha, a aplicação **não conhece o estado do banco** — subir assim é aceitar
comportamento indefinido. A revisão anterior continua servindo.

**4. Rollback — aplicação e schema são problemas separados**
- **Aplicação:** reativar a **revisão anterior** do Container App (tráfego 100% na
  antiga). Imediato.
- **Schema:** **não** existe "down migration". A segurança vem da disciplina
  *expand → contract* (abaixo): toda migração é compatível com a versão anterior
  do app, então o rollback da aplicação nunca exige rollback de schema.

---

## Expand → Contract

Toda migração deve ser **backward-compatible**: segura de rodar enquanto a versão
**anterior** do app ainda está no ar. Mudanças destrutivas se dividem em **dois
releases** — expandir em um, contrair no seguinte, depois que nenhuma versão viva
depende mais do formato antigo.

### Classificação de migrações

| Tipo | Permitido no mesmo release? | Exemplo |
|---|---|---|
| **Expand** | ✅ | adicionar coluna *nullable*, nova tabela, novo índice |
| **Backfill** | ✅ | preencher dados em registros existentes |
| **Contract** | ❌ | remover coluna, remover tabela, tornar coluna obrigatória |

Quem abrir um PR de migração identifica de imediato em qual categoria ele está. Um
**Contract** nunca vai junto do release que ainda usa o formato antigo — ele só
entra depois que o Expand+Backfill correspondente já estão em produção e nenhuma
revisão ativa depende mais do formato removido.

**Exemplo (renomear/remover coluna, feito com segurança):**
1. Release 1 — *Expand*: cria a coluna nova (nullable) + *Backfill* dos dados.
2. App passa a ler/escrever na coluna nova.
3. Release 2 — *Contract*: remove a coluna antiga, quando nada mais a usa.

---

## Regras que este documento fixa

1. **Fail-closed no startup** — migração falhou, container não sobe.
2. **Health/readiness probe** — boot quebrado não recebe tráfego.
3. **Expand → Contract** — migração sempre backward-compatible; destrutivo em 2 releases.
4. **Migration check no CI** — migração validada no PR.
5. **Rollback de app = revisão anterior**; rollback de schema não existe (evitado por 1–3).

---

## Implementação das regras

Todas as regras deste documento estão implementadas:

| Item | O que | Regra | PR |
|---|---|---|---|
| B1 | `docker-entrypoint` fail-closed | 1 | #15 (feature/deploy-seguro) |
| B2 | Step "Migration check" no CI | 4 | #15 (feature/deploy-seguro) |
| B3 | Probes declaradas no Bicep (`infra/bicep/modules/containerApp.bicep`) | 2 | #15 (feature/deploy-seguro) |
| B4 | Probes **aplicadas no ambiente** de homologação | 2 | 2026-07-27 (fora de PR — ver abaixo) |

**Declarado não é o mesmo que em vigor.** Entre #15 e 2026-07-27 este documento
afirmava a regra 2 implementada, mas o Container App tinha **zero probes**: elas
existiam apenas no Bicep, que é baseline não aplicado. O `/api/health` respondia
e nada o consultava — boot quebrado seguiria recebendo tráfego, exatamente o que
a regra 2 existe para impedir.

As três probes (Startup 30×5s, Readiness 10s, Liveness 30s, todas em
`/api/health`) foram aplicadas ao ambiente em 2026-07-27, com os mesmos valores
declarados no Bicep, gerando a revisão `--0000009`. O Bicep segue sendo a fonte
de verdade: se o ambiente for recriado a partir dele, as probes vêm junto.

Lição registrada: ao marcar uma regra como implementada, distinguir **onde** —
no código, no template ou no ambiente. Só a última significa que a regra está
protegendo alguém.

---

## Quando houver CD (futuro, fora de escopo agora)

Ao existir service connection para o Azure, a **aplicação** da migração migra do
startup para um passo do pipeline, **antes** de rotear tráfego para a revisão
nova. As regras 1–5 permanecem; muda apenas *onde* o `migrate deploy` roda.
Registrar como ADR quando a decisão for tomada.
