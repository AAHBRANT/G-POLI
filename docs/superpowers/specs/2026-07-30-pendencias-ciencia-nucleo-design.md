# Núcleo de pendências de ciência (Fase A)

Data: 2026-07-30
Status: aprovado pelo usuário (conversa), aguardando plano de implementação

## Contexto

O usuário pediu um sistema completo de notificações de pendência de leitura
(badges na sidebar, sino, painel, dashboard admin, lembretes automáticos).
É grande demais pra uma spec só — foi decomposto em 4 fases independentes,
confirmadas com o usuário:

- **A (esta spec)** — núcleo de dados: quem está pendente de quê, reabertura
  de pendência a cada republicação, contagem em tempo real.
- **B** — superfícies de UI que leem a pendência (badges, sino, painel, toast,
  status na página do documento).
- **C** — painel administrativo de conformidade (métricas por documento,
  tabela filtrável, dashboard com gráficos).
- **D** — lembretes automáticos (3/7/15 dias) — precisa de infraestrutura de
  agendamento que não existe hoje no projeto.

Cada fase é spec → plano → implementação própria. Esta spec cobre só a Fase A.

O projeto já tem uma tabela `Ciencia` (confirmação de leitura: politicaId,
usuarioOid, usuarioNome, usuarioEmail, criadoEm, ip, politicaPublicadaEm) e um
componente `CienciaLeitura.tsx` com modal de leitura + confirmação. O que
falta é o lado "negativo": saber QUEM ainda NÃO confirmou, de forma rápida
e agregável (por usuário, por categoria, por documento).

## Decisões já fechadas com o usuário

1. **Cargo/função como dimensão de público-alvo fica para depois** — v1 usa
   o que já existe (todos / por Setor / usuários específicos, via
   `audienciaSetores`/`audienciaUsuarios`, já implementado). Não há campo de
   cargo no `Usuario` hoje.
2. **"Tempo real sem reload" inclui atualização entre usuários** — se outra
   pessoa publica agora, minha tela deve refletir a pendência nova sem F5,
   mesmo que eu não tenha feito nada. Não só o reflexo da minha própria ação.
3. **Mecanismo de tempo real: polling leve (30s)**, não WebSocket/SSE. O app
   roda em réplica única (Azure Container Apps, ver `docs/DEPLOY.md`) —
   WebSocket exigiria infraestrutura nova que não existe; polling cabe na
   arquitetura atual sem serviço adicional.
4. **Modelo de dados: tabela `Pendencia` materializada**, não cálculo
   derivado a cada leitura. Justificativa: as Fases C (dashboard admin) e D
   (lembretes) precisam varrer "todo mundo pendente" em escala de milhares
   de usuários — cálculo derivado (join Política+audiência+Ciência a cada
   consulta) não escala para isso; uma tabela indexada sim.

## Não-objetivos (fora desta fase)

- Badges visuais, sino, card do painel, toast — Fase B.
- Dashboard/relatórios de conformidade — Fase C.
- Lembretes automáticos e qualquer agendamento — Fase D.
- Cargo/função como público-alvo — adiado, sem data.
- Integrações externas (e-mail, Teams, WhatsApp) — mencionadas pelo usuário
  como preparação futura; esta fase não implementa nenhuma, só não fecha
  a porta pra elas (o registro de `Pendencia` é o dado que uma futura
  integração consumiria).

## Arquitetura

### 1. Modelo de dados

```prisma
enum EstadoPendencia {
  pendente
  resolvida  // usuário deu ciência
  cancelada  // política revogada antes da ciência, ou pendência superada por republicação
}

model Pendencia {
  id                  String          @id @default(cuid())
  politica            Politica        @relation(fields: [politicaId], references: [id], onDelete: Cascade)
  politicaId          String
  usuario             Usuario         @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  usuarioId           String
  politicaPublicadaEm DateTime        // a qual publicação (versão) esta pendência se refere
  tipo                TipoDocumento   // denormalizado do Politica.tipo — evita join na contagem por categoria
  estado              EstadoPendencia @default(pendente)
  criadaEm            DateTime        @default(now())
  resolvidaEm         DateTime?

  @@unique([politicaId, usuarioId, politicaPublicadaEm])
  @@index([usuarioId, estado])
}
```

Migration: `Politica` e `Usuario` ganham a relação reversa (`pendencias
Pendencia[]`) — puramente aditivo, sem impacto em dado existente.

`tipo` é denormalizado (copiado de `Politica.tipo` no momento da criação) de
propósito: a contagem por categoria (usada pela Fase B na sidebar) roda em
toda carga de página autenticada — não pode depender de um join.

### 2. Criação — hook em `publicarPolitica`

Dentro da mesma transação fail-closed já existente
(`app/(shell)/catalogo/[id]/estado-actions.ts`, feature de geração de .docx
recém-implementada), depois de resolver a audiência (reaproveitando
`audienciaVazia`/`unirAudiencia`, já usadas hoje para a notificação Teams):

1. Marcar como `cancelada` qualquer `Pendencia` `pendente` da MESMA política
   com `politicaPublicadaEm` anterior (a nova publicação substitui — só a
   versão atual importa, evita contagem duplicada).
2. Criar uma `Pendencia` (`estado: pendente`) para cada usuário da audiência
   resolvida, com `politicaPublicadaEm` = o timestamp desta publicação e
   `tipo` = `politica.tipo`.

Isso significa: **toda política publicada agora sempre gera pendência**,
mesmo pra quem já tinha dado ciência da versão anterior — exatamente o
comportamento pedido ("nova versão sempre reabre pendência").

### 3. Resolução — hook em `darCiencia`

Ao confirmar ciência (`app/(shell)/catalogo/[id]/ciencia-actions.ts`), depois
de criar o registro `Ciencia` (inalterado): localizar a `Pendencia`
correspondente (`politicaId` + `usuarioId` + `politicaPublicadaEm` igual ao
`Ciencia.politicaPublicadaEm`) e marcar `estado: resolvida`,
`resolvidaEm: now()`.

### 4. Cancelamento — hook em `revogarPolitica`

Toda `Pendencia` `pendente` daquela política vira `cancelada` (não faz
sentido cobrar ciência de norma revogada).

### 5. Leitura — endpoint de contagem

`GET /api/pendencias/contagem` (novo). Retorna, para o usuário autenticado
(via `getUsuarioAtual()`, já existente):

```json
{ "total": 6, "porTipo": { "politica": 3, "procedimento": 1, "manual": 2 } }
```

Query: `prisma.pendencia.groupBy({ by: ["tipo"], where: { usuarioId, estado: "pendente" }, _count: true })`
— indexada por `[usuarioId, estado]`, sem join.

### 6. Tempo real — polling no client

`components/shell/Sidebar.tsx` já é `"use client"`. Novo hook
`usePendencias()` (`lib/hooks/usePendencias.ts` ou local ao componente):
busca o endpoint a cada 30s (`setInterval` + `fetch`, limpo no
`useEffect` cleanup) e expõe `{ total, porTipo }`. A Fase B consome esse
hook para os badges/sino; esta fase só entrega o hook + endpoint
funcionando (testável isoladamente, sem UI nova ainda).

## Testes

- `lib/politica/pendencia.ts` (novo, funções puras extraídas do mesmo jeito
  que o resto do domínio): decidir quais usuários entram na pendência dada
  uma audiência resolvida (reaproveita tipo já usado por
  `unirAudiencia`/`audienciaVazia`) — testável sem banco.
- Teste de integração (mock de Prisma, mesmo padrão de
  `tests/estado-actions.test.ts`): publicar uma política cria `Pendencia`
  pendente pra cada usuário-alvo; republicar cancela a pendência anterior e
  cria uma nova; dar ciência resolve a pendência certa (verificar
  `politicaId`+`usuarioId`+`politicaPublicadaEm` no `where`, não só que foi
  chamado — mesmo cuidado que a revisão final da feature de .docx cobrou);
  revogar cancela pendências em aberto.
- Teste do endpoint `/api/pendencias/contagem`: contagem correta, agrupada
  por tipo, só do usuário autenticado (não vaza pendência de outro usuário).

## Riscos / pontos em aberto pro plano de implementação

1. **Volume de escrita no publish**: para uma política com audiência "todos
   os colaboradores" (milhares), publicar cria milhares de linhas
   `Pendencia` numa única transação. Precisa confirmar que
   `createMany` (não `create` em loop) é usado, e medir o tempo dentro do
   fail-closed — se ficar lento demais, pode exigir mover a criação de
   `Pendencia` para FORA da transação de publicação (best-effort, não
   fail-closed) — decisão a confirmar no plano, já que fail-closed pra
   `Pendencia` não tem a mesma criticidade que fail-closed pro `.docx`
   oficial (perder uma pendência é recuperável; publicar sem o documento
   oficial não é).
2. **Polling em 30s por usuário**: com milhares de usuários simultâneos,
   isso é uma query indexada leve a cada 30s por sessão ativa — deve ser
   barato, mas vale confirmar no plano com uma estimativa de carga.
