# ADR-002 — Adoção temporária de agente self-hosted para CI

- **Status:** Accepted
- **Data:** 2026-07-26
- **Decisores:** Wellington Lourenço, engenharia da plataforma

## Contexto
O pipeline de CI (`azure-pipelines.yml`) roda em cada PR e no `main`. A
paralelismo gratuito de agentes **Microsoft-hosted** da organização
`AAHBRANT-DEV` está em **0** — solicitações de build ficavam presas em
"Acquiring an agent from the cloud" indefinidamente, bloqueando todo o fluxo
de PR (build validation obrigatório antes de merge).

A concessão de paralelismo hospedado é feita pela Microsoft mediante
solicitação (https://aka.ms/azpipelines-parallelism-request) e leva dias.
Sem CI não há merge; sem merge a plataforma para.

## Decisão
Adotar um **agente self-hosted** (`gpol-selfhosted`, pool `Default`) como
solução **transitória** para destravar o CI enquanto a concessão de
paralelismo Microsoft-hosted não é liberada. O `azure-pipelines.yml` passa a
usar `pool: name: Default` (antes `vmImage: ubuntu-latest`).

## Alternativas consideradas
- **A — Esperar a concessão da Microsoft.** Bloqueia a plataforma por dias
  sem previsão firme. Recusada: custo de oportunidade alto.
- **B — Pagar paralelismo hospedado.** Resolve, mas introduz custo recorrente
  antes de validar a necessidade real de escala. Recusada por ora.
- **C — Agente self-hosted (escolhida).** Custo zero, controle total do
  ambiente, destrava imediato. Trade-off: manutenção manual da máquina.

## Consequências
- **Positivas:**
  - CI destravado imediatamente, custo zero.
  - Controle total do ambiente (versões de node/docker/prisma auditáveis —
    ver `docs/CI.md`).
- **Negativas / trade-offs:**
  - A máquina do agente é responsabilidade nossa: disco, atualização do
    Agent, disponibilidade. Já observado disco **95% cheio** no build 10/12
    (risco para `docker build`) — mitigar com limpeza periódica.
  - Agente Windows exige cuidado com scripts (`cmd.exe` quebra encadeamento
    de `.cmd`; PowerShell Core `pwsh` não instalado — usar `powershell:`).
  - Ponto único de falha enquanto for um só agente.
- **Impacto em contratos/capacidades:** nenhum no produto; decisão puramente
  de infraestrutura de CI.

## Critério de saída
A remoção do agente self-hosted (retorno a `vmImage: ubuntu-latest` ou
modelo híbrido) **só ocorrerá após**:
1. a concessão de paralelismo Microsoft-hosted estar disponível; **e**
2. validação de que o pipeline executa **verde em agentes Microsoft-hosted**;
   **e**
3. confirmação de que o grant **atende à demanda** de builds da plataforma.

Grant liberado **não basta** — a migração de volta também precisa ser
validada antes de descomissionar o self-hosted.
