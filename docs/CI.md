# CI — Integração Contínua (G-Políticas)

Documento operacional do pipeline de CI. Ver decisão em
[`docs/adr/ADR-002-agente-selfhosted-ci.md`](adr/ADR-002-agente-selfhosted-ci.md).

## Visão geral
- **Pipeline:** `azure-pipelines.yml` (raiz do repo).
- **Organização / projeto:** `AAHBRANT-DEV` / `Plataforma-IA`.
- **Repositório:** `g-politicas`.
- **Gatilhos:** todo PR para `main` (build validation obrigatório) e todo push
  em `main`.
- **Etapas:** Node 20 → `npm ci` → **Diagnóstico do ambiente** → `prisma
  generate` → `tsc --noEmit` → lint (não bloqueante) → testes (Vitest) →
  build Next.js → build da imagem Docker.

## Agente de build
- **Modelo:** self-hosted (temporário — ver ADR-002).
- **Pool:** `Default`.
- **Nome do agente:** `gpol-selfhosted`.
- **Máquina:** Windows.
- **Diretório do agente:** `C:\azp-agent`.
- **Versão do Azure Pipelines Agent:** `5.275.0`.

### Requisitos da máquina
Ferramentas que precisam estar no PATH do agente (baseline auditável abaixo):
`node`, `npm`, `git`, `docker`, e as dependências do projeto via `npm ci`.
Docker precisa estar em execução (etapa final faz `docker build`).

### Instalação do agente (resumo)
1. Baixar o agente:
   `https://download.agent.dev.azure.com/agent/5.275.0/vsts-agent-win-x64-5.275.0.zip`
2. Extrair em `C:\azp-agent`.
3. Configurar (PAT com escopo *Agent Pools: Read & manage*):
   ```
   & "C:\azp-agent\config.cmd" --unattended --url https://dev.azure.com/AAHBRANT-DEV \
     --auth pat --token <PAT> --pool Default --agent gpol-selfhosted \
     --replace --acceptTeeEula
   ```
   > O PAT só é usado no registro. Depois o agente usa credencial própria de
   > listener — revogar o PAT **não** derruba o agente.

### Iniciar / parar / atualizar
- **Iniciar (interativo):** `& "C:\azp-agent\run.cmd"`
- **Parar:** encerrar o processo `Agent.Listener` (Ctrl+C na janela do
  `run.cmd`, ou finalizar o processo).
- **Rodar como serviço (recomendado):** `& "C:\azp-agent\config.cmd" --runAsService`
- **Atualizar:** o Azure DevOps atualiza o agente automaticamente; para forçar,
  reconfigurar com uma versão nova do pacote.

### Recuperação de falha
- **Build preso em "Acquiring an agent":** agente offline. Verificar em
  *Project Settings → Agent pools → Default → Agents* se está *Online*; se não,
  iniciar `run.cmd` na máquina.
- **Autorização de pool (primeira execução):** pipeline novo pode ficar
  `notStarted` aguardando autorização do pool. Autorizar em
  *Pipeline → ⋯ → Manage security* (ou via `pipelinePermissions`).
- **Disco cheio:** o agente já reportou `Free disk space on C:\ is lower than
  5%`. Limpar com:
  ```
  docker system prune -af --volumes
  ```
  e remover artefatos antigos em `C:\azp-agent\_work`.

## Ambiente do agente — baseline (auditável)
Versões capturadas pelo passo **Diagnóstico do ambiente** (build 14,
`fix/ci-diagnostico-pwsh`, 2026-07-26):

| Ferramenta | Versão |
|---|---|
| Azure Pipelines Agent | 5.275.0 |
| node | v20.20.2 |
| npm | 10.8.2 |
| git | 2.54.0.windows.1 |
| docker | 29.6.2 (build dfc4efb) |
| prisma / @prisma/client | 5.17.0 (binaryTarget `windows`, win32/x64) |

> O passo usa `powershell:` (Windows PowerShell 5.1), **não** `script:`/cmd nem
> `pwsh:` (Core). Motivo: cmd.exe encerra o batch ao chamar `npm.cmd`/`npx.cmd`
> sem `call` (engole comandos seguintes); `pwsh` (PowerShell Core) não está
> instalado no agente. Ver histórico em PR #5/#6.

## Homologação do CI

Marco de que o ambiente de CI passou a ser considerado **confiável**.

- **Data da homologação:** 2026-07-26
- **Agente:** `gpol-selfhosted` (pool `Default`, Agent 5.275.0)
- **Critério:** dois builds consecutivos verdes no mesmo agente, sem qualquer
  intervenção manual entre eles.
- **Builds aprovados:**
  - **Build 8** — trigger: merge do PR #4 em `main` (`individualCI`),
    commit `814b9491` — ✅ succeeded.
  - **Build 9** — trigger: manual em `main`, commit `814b9491` — ✅ succeeded.
- **Observações:**
  - Disco do agente reportado a ~95% de uso — acompanhar (ver Recuperação de
    falha).
  - Diagnóstico de ambiente ajustado em seguida (PR #5 introduziu; PR #6
    corrigiu `script:`→`powershell:` para capturar as 5 versões).

## Marco — CI operacional
Trilha completa da decisão, reconstruível pelo histórico do repositório:

| Item | Referência |
|---|---|
| Adoção do agente self-hosted (pool `Default`) | PR #4 |
| Builds da homologação | Build 8 e Build 9 |
| Diagnóstico do ambiente (baseline no log) | PR #5 (introduz) + PR #6 (corrige) |
| Documentação operacional + evidência | este `docs/CI.md` |
| Decisão arquitetural | ADR-002 |

A partir deste marco, o CI é considerado operacional e confiável para servir
de base à esteira de Infraestrutura como Código (`platform-infrastructure`).
