# learnings.md — memória de execução

## Protocolo
- **Início da sessão:** ler este arquivo antes de agir.
- **Fim da sessão:** registrar o que evitar, qual regra muda, o que fazer
  diferente. Manter enxuto.

## Regras ativas (semânticas — sempre aplicar)
- **Decidir domínio antes de código.** Todo PR de código implementa regra do
  `DOMINIO.md`/`DEPLOY.md`. Sem problema concreto → sem PR.
- **Agente de CI é Windows:** em passo multi-linha do pipeline usar `powershell:`
  (Windows PowerShell 5.1) — **não** `script:`/cmd (encerra o batch ao chamar
  `npm.cmd`/`npx.cmd` sem `call`) nem `pwsh:` (PowerShell Core não instalado).
- **Não disparar build manual em `refs/pull/N/merge`** — dá race no ref
  (checkout falha). Seguir o build que a própria branch policy enfileira.
- **Extração de regra pura só quando necessário para testar.** Actions
  orquestram; helpers puros em `lib/`. Zero mudança de comportamento (mensagens
  preservadas). Ex.: `lib/rbac.ts`, `lib/dominio.ts`.
- **Não versionar artefato de build.** `*.tsbuildinfo`, `coverage/`, `.next/`
  ficam no `.gitignore`.
- **Merge só pela UI, com policy verde.** Nunca CLI, nunca bypass.

## Log de incidentes (episódico)

### [2026-07-26] Diagnóstico de ambiente logava só node/npm
- Causa: `cmd.exe` encerra o batch ao chamar `npm.cmd` sem `call` → git/docker/
  prisma nunca rodavam; build seguia verde (npm saía 0).
- Correção: passo em `powershell:` (após tentativa falha com `pwsh:` — Core
  ausente no agente).
- Regra: ver "Regras ativas" (agente Windows).
- Escopo: `azure-pipelines.yml`. Reversível: PR #5/#6.
- Status: promovido.

### [2026-07-26] Builds manuais em pr/N/merge falhavam no checkout
- Causa: disparar `az pipelines run --branch refs/pull/N/merge` corre com a
  criação do ref → `couldn't find remote ref`.
- Correção: seguir o build da policy, não disparar manual.
- Regra: promovida (ver acima).
- Status: promovido.

### [2026-07-26] `tsconfig.tsbuildinfo` sujava o git status
- Causa: artefato de build rastreado e fora do `.gitignore`; regenera a cada
  `tsc`/`build`.
- Correção: `git rm --cached` + `*.tsbuildinfo`/`coverage/` no `.gitignore`.
- Escopo: `.gitignore`. Reversível: PR #12.
- Status: promovido.

### [2026-07-26] Inventário de actions superestimou riscos
- Causa: analisei "o que o código grava" antes de "o que o negócio permite" e
  antes do schema (constraints). 3 dos ~5 "riscos Alta" já eram garantidos pelo
  banco (`@@unique` de numero, snapshot atômico em 1 linha, ciência auto-contida).
- Correção: mapa de domínio + leitura do schema antes de propor PRs.
- Regra: "decidir domínio antes de código" (promovida).
- Status: promovido.

## Consolidação (rodar periodicamente)
- Recorrência provada (2–3x) → promover regra para CLAUDE.md e aposentar a
  entrada. Remover entradas obsoletas / que citam arquivos deletados. Manter o
  arquivo enxuto (~200 linhas).
