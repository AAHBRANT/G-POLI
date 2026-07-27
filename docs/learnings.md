# learnings.md — memória de execução

## Protocolo
- **Início da sessão:** ler este arquivo antes de agir.
- **Fim da sessão:** registrar o que evitar, qual regra muda, o que fazer
  diferente. Manter enxuto.

## Regras ativas (semânticas — sempre aplicar)
- **Decidir domínio antes de código.** Todo PR de código implementa regra do
  `DOMINIO.md`/`DEPLOY.md`. Sem problema concreto → sem PR.
- **Nunca engolir exceção que o usuário vai ter de reportar.** Um `catch {}` que
  cai num estado genérico transforma diagnóstico em adivinhação: no login do
  Teams ele escondeu a mensagem exata da falha e custou dois diagnósticos
  errados. Exibir o motivo (ou logá-lo) antes de teorizar sobre a causa.
- **Diagnosticar pelo comportamento, não pelo painel.** O control plane da Azure
  afirmou `state: Ready` e `is_db_alive = 1` com o Postgres recusando conexão. A
  verdade veio de um `psql` de IP liberado. Métrica que não emite dado algum
  (nem zero) é sinal de recurso doente, não de recurso ocioso.
- **Agente de CI é Windows:** em passo multi-linha do pipeline usar `powershell:`
  (Windows PowerShell 5.1) — **não** `script:`/cmd (encerra o batch ao chamar
  `npm.cmd`/`npx.cmd` sem `call`) nem `pwsh:` (PowerShell Core não instalado).
- **Nunca redirecionar o stderr de executável nativo em PS 5.1.** `docker x
  2>$null` (ou `2>&1` atribuído) embrulha cada linha em `NativeCommandError`; com
  `$ErrorActionPreference = "Stop"` isso **aborta o script**, mesmo quando a
  mensagem era esperada. Consultar o estado antes de agir — ex.:
  `docker ps -aq --filter "name=^x$"` e só então remover.
- **Agente de CI é a máquina de desenvolvimento.** Nenhum passo pode assumir
  recurso exclusivo: a 5432 é do Postgres de dev (`g-politicas-db`), então o
  banco descartável do migration check usa a **55432**. Vale para qualquer porta,
  diretório ou nome de container que o CI queira reservar.
- **Uma variável, uma definição no pipeline.** Definir em `variables:` (topo) ou
  no `env:` do passo — nunca nos dois. Com as duas, o valor de `variables:` é o
  que chega ao script e a divergência é silenciosa.
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

### [2026-07-27] Agente de CI offline deixou 5 PRs enfileiradas sem executor
- Causa: `C:\azp-agent` está configurado para rodar interativo (`run.cmd`, sem
  arquivo `.service`), então o agente morre com a sessão que o iniciou. Os builds
  da branch policy ficam `notStarted` indefinidamente — parece PR travada, é
  agente ausente.
- Correção: subir o agente (`cmd /c "cd /d C:\azp-agent && run.cmd"`) e conferir
  `status=online` na API de pools antes de investigar qualquer build parado.
- Pendência: instalar como serviço (`config.cmd --runAsService`) — precisa admin
  e reautenticação; enquanto não for feito, cai a cada reboot.
- Status: aberto (pendência operacional).

### [2026-07-27] Migration check reprovava sempre — três causas em série
- Causa 1: `docker rm -f pg-migcheck 2>$null` abortava o script no caso normal
  (sem container residual) — ver regra do stderr em PS 5.1.
- Causa 2: `-p 5432:5432` nunca subia; a 5432 é do Postgres de dev na mesma
  máquina do agente — ver regra "agente é a máquina de desenvolvimento".
- Causa 3: mesmo com o script lendo a porta da `DATABASE_URL`, havia **duas**
  definições da variável no YAML (`variables:` com 5432 e `env:` do passo com
  55432); o valor de `variables:` foi o que chegou ao script.
- Correção: consulta antes de remover; porta derivada da `DATABASE_URL`; uma só
  definição da variável, em `variables:`.
- Verificação: build #54 aplicou as 10 migrações em `localhost:55432` e os 13
  passos fecharam. Antes disso, cada causa foi reproduzida localmente.
- Escopo: `scripts/ci/migration-check.ps1`, `azure-pipelines.yml`. Reversível:
  PR #18.
- Regras: três promovidas (stderr em PS 5.1; agente = máquina de dev; uma
  variável, uma definição).
- Status: promovido.

### [2026-07-27] Build de PR usa YAML do enfileiramento, código do checkout
- Causa: o build 49 rodou o script já corrigido (checkout no momento da execução)
  com a `DATABASE_URL` antiga (YAML lido quando o build foi enfileirado). O
  sintoma imitava "o fix não funcionou".
- Correção: depois de push que altere o próprio pipeline, avaliar o build
  **seguinte**, não o que já estava na fila.
- Status: observação (1 ocorrência — não promovido).

### [2026-07-27] Postgres Flexible travado: `restart` não resolve, `stop`/`start` sim
- Sintoma: app em `P1001`; `psql` de IP liberado recebendo `Connection refused` e
  `server closed the connection unexpectedly`; gateway aceitando TCP mas backend
  não atendendo; `connections_succeeded` e `active_connections` sem emitir dado.
- Causa: trava de estado no nó subjacente do `Standard_B1ms`, com control plane
  inconsistente — `restart` falhou 6 vezes seguidas com `InternalServerError`.
- Correção: ciclo `stop` + `start` via az CLI, que desaloca o nó e reprovisiona.
- Falso caminho percorrido: atribuí a falha ao firewall e apliquei 98 regras /24
  por IP de egresso. Teste controlado depois provou que a regra
  `AllowAllAzureServicesAndResourcesWithinAzureIps` (0.0.0.0) **cobre** o egresso
  do Container App — regra por IP é desnecessária. Regras removidas.
- Regra: ver "diagnosticar pelo comportamento, não pelo painel".
- Status: promovido.

### [2026-07-27] Login no Teams: dois bloqueios independentes
- Causa 1: sessão em cookie `SameSite=Lax`. No iframe do Teams tudo é
  cross-site, então o cookie nunca era enviado — sessão criada e invisível ao
  servidor, devolvendo ao `/login` em loop. Corrigido para `SameSite=None`
  (exige `Secure`; em `http://localhost` segue `Lax`).
- Causa 2: redirect de página inteira para o Entra dentro do iframe. O endpoint
  de autorização responde `X-Frame-Options: DENY` → frame preto sem erro. O
  caminho suportado é `authentication.authenticate()`, que abre janela.
- Causa 3 (a raiz do SSO silencioso): App ID URI **sem domínio**. O Teams exige
  `api://<domínio>/<client-id>`; com `api://<client-id>` o `getAuthToken()`
  recusa com "App resource defined in manifest and iframe origin do not match" —
  independente de permissão e consentimento, que estavam corretos.
- Diagnóstico atrasado por `catch {}` silencioso (regra promovida acima).
- Escopo: `lib/auth/session.ts`, `components/BotaoEntrar.tsx`,
  `teams/manifest.json`. Reversível: PRs #24 e #25.
- Status: promovido.

### [2026-07-27] Build de imagem quebrado por CRLF no entrypoint
- Causa: `core.autocrlf=true` sem `.gitattributes` converte
  `docker-entrypoint.sh` no checkout; o shebang vira `#!/bin/sh\r` e o container
  morre com `exec: ./docker-entrypoint.sh: not found`. O blob no git sempre
  esteve com LF — a corrupção é na cópia de trabalho de quem constrói a imagem.
- Correção: `.gitattributes` com `eol=lf` para `*.sh` e `Dockerfile`.
- Regra: ver "não versionar artefato de build" (mesma família: o repositório
  manda no formato, não a configuração local da máquina).
- Escopo: `.gitattributes`. Reversível: PR #22.
- Status: promovido.

## Consolidação (rodar periodicamente)
- Recorrência provada (2–3x) → promover regra para CLAUDE.md e aposentar a
  entrada. Remover entradas obsoletas / que citam arquivos deletados. Manter o
  arquivo enxuto (~200 linhas).
