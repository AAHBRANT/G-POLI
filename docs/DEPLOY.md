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
