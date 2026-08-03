# Lembretes automáticos de ciência pendente (Fase D) — Design

## Contexto

Sistema de pendência de ciência (`Pendencia`, badges, sino, polling) já está em
produção (Fases A e B, [2026-07-30-pendencias-ciencia-nucleo-design.md](2026-07-30-pendencias-ciencia-nucleo-design.md),
[2026-08-01-pendencias-ciencia-fase-b-design.md](2026-08-01-pendencias-ciencia-fase-b-design.md)).
A spec da Fase A já previa uma **Fase D — lembretes automáticos (3/7/15 dias)**
e a deixou de fora explicitamente por falta de infraestrutura de agendamento
no projeto. Esta spec cobre essa Fase D.

O que falta: quando uma `Pendencia` continua com `estado: pendente` por 3, 7 ou
15 dias corridos desde `criadaEm`, o colaborador precisa ser lembrado de novo —
o sino/badge já existentes só mostram o estado atual, não reforçam com o tempo.
Aos 15 dias, o SGI/Qualidade também precisa ficar sabendo, pra poder cobrar.

**Decisão de negócio explícita do usuário nesta sessão:** o perfil "Gestor de
Setor" vai ser removido do sistema numa tarefa futura separada — esta feature
não cria nenhuma dependência nova nesse perfil, e a escalação de 15 dias vai
para o perfil **SGI/Qualidade**, não para gestor de área.

## Não-objetivos

- E-mail — não foi pedido, não existe integração hoje.
- Mensagem de chat real do bot do Teams (exigiria Azure Bot Service — infra
  desproporcional ao problema). Usamos notificação de feed de atividade do
  Teams, que não precisa de bot.
- Qualquer alteração ligada ao perfil "Gestor de Setor" — será removido numa
  tarefa própria, futura, fora desta spec.
- Painel de conformidade / dashboard admin (Fase C, spec própria, ainda não
  escrita).

## Arquitetura

**Correção pós-aprovação (achada ao investigar o Dockerfile antes de planejar):**
o runtime do app usa o **output standalone do Next.js** (`COPY .next/standalone`)
— não inclui `node_modules` completos, TypeScript, nem qualquer arquivo em
`scripts/` que não seja importado por uma rota/página do Next. Um "script novo
rodando na mesma imagem" não existe de fato nessa imagem. Correção: a lógica
mora numa **rota de API protegida por secret** (que O Next.js SEMPRE inclui no
build), e o Container Apps Job só *dispara* essa rota via HTTP.

Um **Azure Container Apps Job** com gatilho agendado (cron), rodando 1x/dia, no
mesmo Resource Group (`rg-gpoliticas`) e mesma imagem Docker do app. O
container do job sobrescreve o `command` pra rodar um arquivo JS **puro** (sem
TypeScript, sem build) copiado explicitamente no Dockerfile —
`node jobs/lembretes-pendencia.js` — que só faz 1 `fetch` autenticado em
`POST /api/cron/lembretes-pendencia` (rota nova, protegida por um secret
compartilhado `CRON_SECRET`, comparado via header `Authorization: Bearer`).

Essa rota, rodando dentro do app Next.js normal (mesmo ambiente de toda API
route hoje):

1. Busca todas as `Pendencia` com `estado: "pendente"`.
2. Para cada uma, aplica a função pura `lembretesPendentes` pra decidir se
   algum marco (3/7/15) venceu e ainda não foi enviado.
3. Envia a notificação Teams correspondente e grava o campo
   `lembreteXEnviadoEm` (idempotência: se o job rodar de novo no mesmo dia,
   ou se falhar no meio e for reexecutado, ninguém recebe o mesmo marco 2x).
4. Acumula quem passou de 15 dias pela primeira vez hoje numa lista; ao final,
   se a lista não estiver vazia, manda **1 notificação-resumo** pro perfil
   SGI/Qualidade (nunca 1 por pessoa — se houver mais de 1 usuário SGI, cada um
   recebe sua própria cópia do MESMO resumo, já que a API do Teams só aceita
   destinatário individual; "1 resumo" descreve o conteúdo, não uma
   transmissão em grupo).

Erro ao notificar 1 usuário (ex.: Graph API fora do ar pra aquele ID) não
aborta o lote inteiro — mesmo padrão *best-effort* já usado na criação de
`Pendencia` na Fase A: loga e continua pros próximos.

## Modelo de dados

Migration aditiva em `Pendencia` (3 campos novos, todos opcionais — não quebra
nenhuma linha existente):

```prisma
model Pendencia {
  // ...campos existentes (id, politicaId, usuarioId, politicaPublicadaEm,
  // tipo, estado, criadaEm, resolvidaEm, notificadaEm)...
  lembrete3EnviadoEm  DateTime?
  lembrete7EnviadoEm  DateTime?
  lembrete15EnviadoEm DateTime?
}
```

`null` = marco ainda não enviado. Preenchido = data do envio, guarda de
idempotência. Reaproveita o índice `@@index([usuarioId, estado])` já
existente — a varredura diária filtra por `estado: pendente`, que já é
indexado.

Quando uma política é republicada, uma nova `Pendencia` é criada (já é assim
hoje, chave única `[politicaId, usuarioId, politicaPublicadaEm]`) — os 3
campos novos nascem `null` de novo, então o relógio de lembrete reinicia
corretamente pra cada nova versão, sem lógica extra.

## Lógica core (função pura)

```ts
// lib/politica/lembretesPendentes.ts
export type MarcoLembrete = 3 | 7 | 15;

export function lembretesPendentes(
  pendencia: {
    criadaEm: Date;
    lembrete3EnviadoEm: Date | null;
    lembrete7EnviadoEm: Date | null;
    lembrete15EnviadoEm: Date | null;
  },
  agora: Date
): MarcoLembrete[] {
  const diasPendente = Math.floor(
    (agora.getTime() - pendencia.criadaEm.getTime()) / (1000 * 60 * 60 * 24)
  );
  const marcos: MarcoLembrete[] = [];
  if (diasPendente >= 3 && !pendencia.lembrete3EnviadoEm) marcos.push(3);
  if (diasPendente >= 7 && !pendencia.lembrete7EnviadoEm) marcos.push(7);
  if (diasPendente >= 15 && !pendencia.lembrete15EnviadoEm) marcos.push(15);
  return marcos;
}
```

Mesmo padrão de `dadosPendencia`/`acaoVersao`: função pura, sem I/O, 100%
testável com data injetada (`agora` como parâmetro, nunca `new Date()`
interno) — cobre o caso de o job rodar atrasado e precisar disparar 2 marcos
de uma vez (ex.: já passou dos 7 dias sem o job ter rodado nos últimos dias:
dispara 3 e 7 juntos, nunca pula o 3).

## Envio Teams (Graph API)

**Correção pós-aprovação:** essa integração **já existe** —
`lib/notificacao/graph.ts` (`enviarNotificacaoPoliticaPublicada`) já usa
exatamente `POST /users/{oid}/teamwork/sendActivityNotification` via Graph com
client credentials, e a permissão de aplicativo `TeamsActivity.Send` **já foi
concedida com admin-consent em 2026-07-28** (comentário no próprio arquivo).
Não existe pré-requisito manual novo — é só estender esse módulo com 2 funções
novas, reaproveitando o mesmo `msalApp()`/`SCOPES_GRAPH_APP` já usados.

`oid` é o `Usuario.oid` (object id do Entra, já gravado no login via SSO) —
usuário que nunca logou tem `oid: null` e é pulado (best-effort, sem travar o
lote: não há como notificar via Teams quem o sistema nunca viu entrar).

Dois tipos de notificação novos, no mesmo arquivo:
- **Individual** (marcos 3/7/15): `topic` aponta pra `/catalogo/{politicaId}`,
  texto varia por marco ("Você tem uma política pendente de ciência há 3
  dias" / 7 / 15).
- **Resumo SGI** (só ao cruzar 15 dias, 1x/dia): manda pra todo usuário com
  perfil SGI/Qualidade, texto tipo "5 pessoas passaram de 15 dias sem dar
  ciência", `topic` aponta pra `/catalogo` (lista geral — sem página de
  conformidade dedicada nesta fase, isso é Fase C).

Precisam de 2 `activityTypes` novos em `teams/manifest.json` (registro
obrigatório do Teams, mesmo já usando `topic.value` totalmente renderizado em
vez de placeholder de template — mesma convenção do tipo existente
`politicaPublicada`).

## In-app: destaque por idade

Sem endpoint novo. Onde a pendência já aparece (painel da home, lista do
sino), o `criadaEm` já disponível vira destaque visual crescente:
- 0-2 dias: como já é hoje (âmbar leve).
- 3-6 dias: âmbar mais forte.
- 7-14 dias: laranja.
- 15+ dias: vermelho.

Cálculo simples de dias corridos, sem estado novo — puramente derivado do
`criadaEm` já existente.

## Erros e idempotência

- Idempotência por marco: `lembreteXEnviadoEm` só é gravado depois do envio
  Teams confirmar sucesso — se o envio falhar, o campo continua `null` e o
  próximo run do job tenta de novo (nunca perde um lembrete por erro
  transitório, nunca duplica um que já confirmou).
- Erro em 1 usuário (Graph API, usuário desativado no AAD, etc.) é logado e
  não interrompe o restante do lote — mesmo padrão da Fase A.
- A rota `/api/cron/lembretes-pendencia` só executa com o header
  `Authorization: Bearer <CRON_SECRET>` correto — sem isso, 401 e nada roda.
  Falha de token/Graph continua best-effort (loga e segue), independente
  disso; o destaque in-app não depende do Teams em nenhum caso.

## Testes

- `lembretesPendentes`: testes unitários puros — 0 dias (nenhum marco), 3/7/15
  exatos, marco já enviado (não repete), múltiplos marcos vencidos de uma vez
  (job atrasado), fronteira de virada de dia.
- `POST /api/cron/lembretes-pendencia`: teste de integração com Prisma de
  teste, mock do módulo Graph — confirma 401 sem o secret certo, que só chama
  Graph pra quem tem marco pendente, grava `lembreteXEnviadoEm` só em sucesso,
  e que o resumo SGI só dispara quando a lista de 15+ dias não está vazia.
- Verificação manual pós-implementação: rodar o Container Apps Job uma vez
  manualmente (`az containerapp job start`) contra uma `Pendencia` de teste
  com `criadaEm` forçado no passado, confirmar notificação Teams recebida e
  campo gravado.
