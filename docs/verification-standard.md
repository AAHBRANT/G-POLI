# verification-standard.md — o que "correto" significa neste projeto

Fonte única de pass/fail. Somente-leitura enquanto uma saída (PR) está sendo
corrigida — nunca se enfraquece um critério para um PR passar. Trabalha junto das
regras globais `self-optimizing-execution`.

## Critérios de aceite (pass/fail — nunca nota)

Toda saída deste projeto é um **PR**. Um PR só é aceitável quando:

1. **CI verde** no build da branch policy (agente self-hosted): validação de
   Bicep, `prisma generate`, migration check, `tsc --noEmit`, testes (Vitest),
   build Next.js e build da imagem Docker.
2. **`tsc --noEmit` limpo** (0 erros de tipo).
3. **Todos os testes Vitest passam** (nenhum skip novo, nenhum flaky).
4. **`npm run build` conclui** sem erro.
5. **`az bicep build` limpo** quando `infra/` é tocado.
6. **`git status` limpo** após o build (nenhum artefato versionado por engano).
7. **Um PR = uma responsabilidade.** Nada de mudança não relacionada no mesmo PR.
8. **Mudança de comportamento só quando intencional.** Extração/refactor =
   comportamento idêntico (mensagens de erro preservadas).
9. **Rastreabilidade ao domínio:** todo PR de código implementa uma regra do
   [`DOMINIO.md`](DOMINIO.md) ou do [`DEPLOY.md`](DEPLOY.md) — não "achei melhor".
10. **Migração classificada** conforme `DEPLOY.md` (Expand/Backfill = ok no
    release; Contract = não). Backward-compatible sempre.
11. **Merge só pela interface** do Azure DevOps, com aprovação e o check
    obrigatório verde. Nunca por CLI, nunca com bypass de policy.

## Como rodar a checagem

- **Objetivo (autoridade final):** o pipeline de CI no PR — ver [`CI.md`](CI.md).
- **Local (antes de abrir o PR):**
  ```
  npm ci && npx prisma generate && npm test && npm run build
  az bicep build --file infra/bicep/main.bicep --stdout   # se infra tocada
  git status                                              # deve estar limpo
  ```
- **Revisor de contexto limpo:** o build da policy roda independente do autor; a
  aprovação (self, no time solo) confirma a revisão. Ver invariantes de domínio
  em `DOMINIO.md` como checklist de comportamento.

## Baseline

- Último commit **verde** na `main`. Qualquer regressão contra ele reprova o PR
  (teste que passava e falha; comportamento que mudou sem intenção).

## Saída de uma checagem

- PASS/FAIL por critério.
- Em FALHA: registrar evidência + defeito em [`learnings.md`](learnings.md) e
  disparar o loop de correção (corrige a **saída**, nunca o critério).
