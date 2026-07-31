# Núcleo de pendências de ciência (Fase A) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda vez que uma política é publicada, criar uma `Pendencia` por
usuário-alvo (reabrindo a cada republicação); resolver ao dar ciência;
cancelar ao revogar. Expor a contagem via endpoint + hook de polling —
sem UI visual ainda (isso é a Fase B).

**Architecture:** Tabela `Pendencia` materializada (não calculada em tempo
de leitura). Criação é *best-effort* (não fail-closed) e roda DEPOIS da
transação de publicação já commitada, reaproveitando a resolução de
audiência que hoje só serve a notificação Teams. Leitura via endpoint
indexado (`usuarioId, estado`) + polling client-side de 30s (sem
WebSocket — app roda em réplica única).

**Tech Stack:** Next.js 14 (App Router, Route Handlers, Server Actions),
Prisma 5.17/PostgreSQL, Vitest.

## Global Constraints

- Criação de `Pendencia` no publish é *best-effort*: falha aqui NUNCA
  desfaz nem bloqueia a publicação já commitada (diferente do `.docx`
  oficial, que é fail-closed) — mesma filosofia já usada para a
  notificação Teams em `notificarAudiencia`.
- Usar `createMany` (nunca `create` em loop) para a criação em massa.
- `Pendencia.tipo` é sempre denormalizado de `Politica.tipo` no momento da
  criação — nunca calculado via join na leitura.
- Nunca `catch {}` silencioso — logar a mensagem real do erro.
- Todo código novo roda `npx tsc --noEmit`, `npx eslint . --ext .ts,.tsx` e
  `npx vitest run` limpos antes de cada commit.
- Migração de schema: expand puro, sem quebrar dado existente.

---

## Pré-requisito

**Não iniciar a Task 3 (nem seguintes) antes da PR #52 (geração do
documento oficial `.docx`) estar mergeada em `main`.** `estado-actions.ts`
e `tests/estado-actions.test.ts`, do jeito que as Tasks 3-5 descrevem,
só existem depois desse merge — hoje só existem no branch
`feat/geracao-docx-oficial`. Antes de dispatchar a Task 3, releia
`tests/estado-actions.test.ts` e `estado-actions.ts` em `main` pra
confirmar que os nomes exatos dos mocks (`versaoCreate`, `versaoUpdateMany`,
`politicaUpdate`, `transacao`, etc.) batem com o que está descrito abaixo —
se algo mudou entre agora e o merge, ajuste antes de escrever o teste.

## Contexto que os tasks abaixo assumem conhecido

- `getUsuarioAtual()` (`lib/auth/usuario.ts`) retorna `UsuarioAtual | null`
  com `{ id, oid, nome, email, perfil, setores }` — `id` é o cuid interno
  (PK de `Usuario`), `oid` é o Object ID do Entra. `Pendencia.usuarioId`
  usa `id` (cuid), não `oid`.
- `publicarPolitica` (`app/(shell)/catalogo/[id]/estado-actions.ts`) já
  publica dentro de uma transação fail-closed (feature de geração de
  `.docx` oficial, implementada nesta mesma sessão) e, depois da transação
  commitar, chama `notificarAudiencia(politicaId, politica.titulo)` dentro
  de um `try/catch` que só loga em caso de erro — a publicação já está
  confirmada nesse ponto, nada desfaz.
- `notificarAudiencia` hoje resolve a audiência internamente (query
  `prisma.politica.findUnique` com `audienciaSetores`/`audienciaUsuarios`)
  e itera enviando notificação Teams por usuário. Este plano extrai essa
  resolução pra uma função compartilhada, pra não duplicar a query nem a
  lógica de "todos vs. setores/usuários específicos" (`audienciaVazia`/
  `unirAudiencia`, já em `lib/politica/dominio.ts`).
- `revogarPolitica` e `darCiencia` (`app/(shell)/catalogo/[id]/ciencia-actions.ts`)
  já existem e são simples — ver código completo nas tasks 3 e 4.

## Decisões de risco já fechadas (da spec)

1. **Volume de escrita no publish**: `createMany` num único INSERT, fora da
   transação fail-closed do `.docx`, best-effort. Uma política com
   audiência "todos os colaboradores" gera N linhas numa chamada só —
   custo de uma bulk insert indexada, não de N round-trips.
2. **Carga do polling (30s)**: uma query `groupBy` indexada
   (`[usuarioId, estado]`) por sessão ativa a cada 30s. Com centenas de
   usuários simultâneos isso é dezenas de queries/segundo, cada uma
   tocando um índice de poucas linhas por usuário — ordem de grandeza
   trivial pro Postgres Flexible Server já em produção (mesmo tier que já
   atende toda a aplicação hoje). Sem necessidade de cache adicional nesta
   fase; se a base de usuários crescer muito, um cache de contagem por
   usuário (TTL curto) é uma otimização futura, não um requisito agora.

---

### Task 1: Modelo de dados (`Pendencia`)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730110000_pendencia/migration.sql`

**Interfaces:**
- Produces: `prisma.pendencia` (Prisma Client), enum `EstadoPendencia`
  (`pendente | resolvida | cancelada`), modelo com
  `{ id, politicaId, usuarioId, politicaPublicadaEm, tipo, estado, criadaEm, resolvidaEm }`.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, adicionar o enum e o modelo (depois do
`model Auditoria`, antes do `model Secao` — mesma região dos modelos de
auditoria/rastreio):

```prisma
enum EstadoPendencia {
  pendente
  resolvida // usuário deu ciência
  cancelada // política revogada antes da ciência, ou pendência superada por republicação
}

// v3: núcleo de pendência de ciência — materializado (não calculado em
// tempo de leitura) porque o dashboard admin e os lembretes automáticos
// (fases futuras) precisam varrer "todo mundo pendente" em escala.
model Pendencia {
  id                  String          @id @default(cuid())
  politica            Politica        @relation(fields: [politicaId], references: [id], onDelete: Cascade)
  politicaId          String
  usuario             Usuario         @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  usuarioId           String
  politicaPublicadaEm DateTime
  tipo                TipoDocumento
  estado              EstadoPendencia @default(pendente)
  criadaEm            DateTime        @default(now())
  resolvidaEm         DateTime?

  @@unique([politicaId, usuarioId, politicaPublicadaEm])
  @@index([usuarioId, estado])
}
```

Adicionar a relação reversa em `model Politica`:

```prisma
  pendencias    Pendencia[]
```

E em `model Usuario`:

```prisma
  pendencias Pendencia[]
```

- [ ] **Step 2: Gerar e aplicar a migration**

```bash
DATABASE_URL=$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//;s/"//g')
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Copiar a saída para `prisma/migrations/20260730110000_pendencia/migration.sql`
(criar a pasta primeiro). Depois:

```bash
npx prisma migrate deploy
npx prisma generate
```

Expected: migration aplicada sem erro, client regenerado.

- [ ] **Step 3: Confirmar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros (o campo ainda não é usado em lugar nenhum nesta task).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260730110000_pendencia
git commit -m "feat(schema): modelo Pendencia (nucleo de ciencia, Fase A)"
```

---

### Task 2: Função pura — dados de `Pendencia` a partir da audiência

**Files:**
- Create: `lib/politica/pendencia.ts`
- Test: `tests/pendencia.test.ts`

**Interfaces:**
- Consumes: `UsuarioAlvo` (tipo já existente em `lib/politica/dominio.ts`,
  formato `{ id, oid, nome, email }`).
- Produces:
  `dadosPendencia(politicaId: string, tipo: string, publicadaEm: Date, alvos: UsuarioAlvo[]): { politicaId, usuarioId, politicaPublicadaEm, tipo, estado: "pendente" }[]`
  — em `lib/politica/pendencia.ts`. Usado pela Task 3 dentro de
  `prisma.pendencia.createMany({ data: ... })`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/pendencia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dadosPendencia } from "@/lib/politica/pendencia";

describe("dadosPendencia", () => {
  it("gera uma linha por usuário-alvo, todas pendente, com o mesmo tipo e publicadaEm", () => {
    const publicadaEm = new Date("2026-07-30T12:00:00Z");
    const alvos = [
      { id: "u1", oid: "oid1", nome: "Ana", email: "ana@aahbrant.com" },
      { id: "u2", oid: "oid2", nome: "Bruno", email: "bruno@aahbrant.com" },
    ];
    const linhas = dadosPendencia("pol1", "politica", publicadaEm, alvos);
    expect(linhas).toEqual([
      { politicaId: "pol1", usuarioId: "u1", politicaPublicadaEm: publicadaEm, tipo: "politica", estado: "pendente" },
      { politicaId: "pol1", usuarioId: "u2", politicaPublicadaEm: publicadaEm, tipo: "politica", estado: "pendente" },
    ]);
  });

  it("audiência vazia gera lista vazia", () => {
    expect(dadosPendencia("pol1", "politica", new Date(), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/pendencia.test.ts`
Expected: FAIL — `Cannot find module '@/lib/politica/pendencia'`.

- [ ] **Step 3: Implementar**

Criar `lib/politica/pendencia.ts`:

```ts
import type { UsuarioAlvo } from "@/lib/politica/dominio";

export type DadoPendencia = {
  politicaId: string;
  usuarioId: string;
  politicaPublicadaEm: Date;
  tipo: string;
  estado: "pendente";
};

// Regra pura: uma Pendencia por usuário-alvo, todas "pendente", presas à
// mesma publicação (politicaPublicadaEm) — usada por createMany em
// estado-actions.ts. Sem I/O, testável isoladamente.
export function dadosPendencia(
  politicaId: string,
  tipo: string,
  publicadaEm: Date,
  alvos: UsuarioAlvo[],
): DadoPendencia[] {
  return alvos.map((a) => ({
    politicaId,
    usuarioId: a.id,
    politicaPublicadaEm: publicadaEm,
    tipo,
    estado: "pendente" as const,
  }));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/pendencia.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: tsc + lint**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
```

- [ ] **Step 6: Commit**

```bash
git add lib/politica/pendencia.ts tests/pendencia.test.ts
git commit -m "feat(pendencia): dadosPendencia (regra pura de geracao)"
```

---

### Task 3: Criar `Pendencia` ao publicar (best-effort, fora da transação)

**Files:**
- Modify: `app/(shell)/catalogo/[id]/estado-actions.ts`
- Test: `tests/estado-actions.test.ts`

**Interfaces:**
- Consumes: `dadosPendencia` (Task 2).
- Produces: `publicarPolitica` chama `resolverAudiencia` (nova, extraída)
  e depois `criarPendencias` (nova) logo antes de `notificarAudiencia`,
  ambas dentro do mesmo bloco `try/catch` best-effort já existente.

- [ ] **Step 1: Ler o arquivo atual e localizar `notificarAudiencia`**

Antes de editar, releia `app/(shell)/catalogo/[id]/estado-actions.ts` —
a função `notificarAudiencia(politicaId, tituloPolitica)` hoje resolve a
audiência internamente (query `prisma.politica.findUnique` com
`audienciaSetores`/`audienciaUsuarios`) e itera enviando notificação Teams.
Este task extrai essa resolução de audiência para uma função própria,
`resolverAudiencia`, reaproveitada tanto pela notificação quanto pela nova
criação de `Pendencia` — evita duas queries idênticas e duas cópias da
lógica `audienciaVazia`/`unirAudiencia`.

- [ ] **Step 2: Escrever o teste (falhando)**

Em `tests/estado-actions.test.ts`, adicionar aos mocks já existentes no
topo do arquivo (mesmo padrão de `vi.mock` já usado nesse arquivo para
`@/lib/prisma`, `@/lib/storage`, `@/lib/politica/gerarDocx` etc.):

```ts
vi.mock("@/lib/politica/pendencia", () => ({ dadosPendencia: vi.fn() }));
```

E os imports correspondentes:

```ts
import { dadosPendencia } from "@/lib/politica/pendencia";
const dadosPendenciaMock = dadosPendencia as ReturnType<typeof vi.fn>;
```

Adicionar ao mock de `@/lib/prisma` (no objeto `prisma` já mockado):
`pendencia: { createMany: vi.fn(), updateMany: vi.fn() }` e
`usuario: { findMany: vi.fn() }` (reaproveitado por `resolverAudiencia`,
que hoje é código de `notificarAudiencia` — copie a estrutura de mock que
já existir ali para audiência-vazia-vira-todos-os-colaboradores).

Novo teste, no `describe("publicarPolitica — geração do documento oficial")`
já existente (ou um novo `describe` logo abaixo dele no mesmo arquivo):

```ts
describe("publicarPolitica — cria Pendencia (best-effort)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Teste", email: "teste@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    transacao.mockImplementation(async (fn) => {
      await fn({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
  });

  it("cria Pendencia via createMany para a audiência resolvida, e cancela pendências anteriores da mesma politica", async () => {
    findUnique.mockResolvedValue(politicaBase());
    dadosPendenciaMock.mockReturnValue([
      { politicaId: "p1", usuarioId: "u1", politicaPublicadaEm: expect.any(Date), tipo: "politica", estado: "pendente" },
    ]);

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(pendenciaUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ politicaId: "p1", estado: "pendente" }),
        data: { estado: "cancelada" },
      }),
    );
    expect(pendenciaCreateMany).toHaveBeenCalledTimes(1);
  });

  it("falha ao criar Pendencia NAO desfaz a publicacao (best-effort)", async () => {
    findUnique.mockResolvedValue(politicaBase());
    dadosPendenciaMock.mockReturnValue([{ politicaId: "p1", usuarioId: "u1", politicaPublicadaEm: new Date(), tipo: "politica", estado: "pendente" }]);
    pendenciaCreateMany.mockRejectedValue(new Error("db fora do ar"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true); // publicação já estava commitada
  });
});
```

(Ajuste os nomes exatos das constantes de mock — `pendenciaUpdateMany`,
`pendenciaCreateMany` — para casar com como você declarar os mocks no
Step anterior, seguindo o padrão de `versaoCreate`/`versaoUpdateMany` já
existente no arquivo.)

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: FAIL — `Pendencia` ainda não é criada em lugar nenhum.

- [ ] **Step 4: Implementar**

Em `app/(shell)/catalogo/[id]/estado-actions.ts`:

1. Adicionar import: `import { dadosPendencia } from "@/lib/politica/pendencia";`
2. Extrair a resolução de audiência de dentro de `notificarAudiencia` para
   uma função nova:

```ts
async function resolverAudiencia(politicaId: string): Promise<UsuarioAlvo[]> {
  const politica = await prisma.politica.findUnique({
    where: { id: politicaId },
    include: {
      audienciaSetores: { include: { membros: { where: { ativo: true } } } },
      audienciaUsuarios: { where: { ativo: true } },
    },
  });
  if (!politica) return [];

  const setorIds = politica.audienciaSetores.map((a) => a.id);
  const usuarioIds = politica.audienciaUsuarios.map((u) => u.id);

  return audienciaVazia(setorIds, usuarioIds)
    ? (await prisma.usuario.findMany({ where: { ativo: true } })).map(paraAlvo)
    : unirAudiencia(
        politica.audienciaSetores.flatMap((a) => a.membros).map(paraAlvo),
        politica.audienciaUsuarios.map(paraAlvo),
      );
}
```

3. Simplificar `notificarAudiencia` para receber a audiência já resolvida
   em vez de recalculá-la:

```ts
async function notificarAudiencia(politicaId: string, tituloPolitica: string, alvos: UsuarioAlvo[]): Promise<void> {
  for (const alvo of alvos) {
    if (!alvo.oid) {
      await prisma.notificacao.create({
        data: { politicaId, usuarioEmail: alvo.email, usuarioNome: alvo.nome, enviada: false, motivo: "sem_oid (nunca autenticou pelo Teams)" },
      });
      continue;
    }
    const resultado = await enviarNotificacaoPoliticaPublicada({ oid: alvo.oid, tituloPolitica, politicaId });
    await prisma.notificacao.create({
      data: { politicaId, usuarioEmail: alvo.email, usuarioNome: alvo.nome, enviada: resultado.ok, motivo: resultado.ok ? "" : resultado.motivo },
    });
  }
}
```

4. Nova função `criarPendencias`:

```ts
// Best-effort (nunca fail-closed): falha aqui NUNCA desfaz a publicação
// já commitada — mesma filosofia de notificarAudiencia. Cancela qualquer
// pendência ainda "pendente" da MESMA política (versão anterior) antes de
// criar a nova, pra nunca contar duas pendências da mesma norma pro mesmo
// usuário.
async function criarPendencias(politicaId: string, tipo: string, publicadaEm: Date, alvos: UsuarioAlvo[]): Promise<void> {
  await prisma.pendencia.updateMany({
    where: { politicaId, estado: "pendente" },
    data: { estado: "cancelada" },
  });
  const linhas = dadosPendencia(politicaId, tipo, publicadaEm, alvos);
  if (linhas.length > 0) {
    await prisma.pendencia.createMany({ data: linhas, skipDuplicates: true });
  }
}
```

5. Em `publicarPolitica`, depois do `await registrar(...)` e antes do bloco
   `try { await notificarAudiencia(...) }`, resolver a audiência uma vez e
   passar pras duas chamadas:

```ts
  await registrar("politica.publicar", "Politica", id, politica.titulo);

  const alvos = await resolverAudiencia(id);

  // Nunca deixar a criação de pendência ou a notificação falharem a
  // publicação: ela já está confirmada.
  try {
    await criarPendencias(id, politica.tipo, agora, alvos);
  } catch (erro) {
    console.error("Falha ao criar pendencias de ciencia (publicação já confirmada):", erro);
  }
  try {
    await notificarAudiencia(id, politica.titulo, alvos);
  } catch (erro) {
    console.error("Notificação de publicação falhou (publicação já confirmada):", erro);
  }
```

(Remova a chamada antiga `await notificarAudiencia(id, politica.titulo);`
sem o terceiro argumento — ela deixa de existir nesse formato.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos).

- [ ] **Step 6: tsc + lint + suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add app/\(shell\)/catalogo/\[id\]/estado-actions.ts tests/estado-actions.test.ts
git commit -m "feat(pendencia): cria Pendencia ao publicar (best-effort, createMany)"
```

---

### Task 4: Resolver `Pendencia` ao dar ciência

**Files:**
- Modify: `app/(shell)/catalogo/[id]/ciencia-actions.ts`
- Test: `tests/ciencia-actions.test.ts` (novo)

**Interfaces:**
- Consumes: nenhuma interface nova de tasks anteriores além do modelo
  `Pendencia` (Task 1).
- Produces: `darCiencia` marca a `Pendencia` correspondente
  (`politicaId` + `usuarioId` = `usuario.id` + `politicaPublicadaEm` =
  `politica.publicadaEm`) como `resolvida`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/ciencia-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(() => new Map()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn() },
    ciencia: { upsert: vi.fn() },
    pendencia: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));
vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { darCiencia } from "@/app/(shell)/catalogo/[id]/ciencia-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const cienciaUpsert = prisma.ciencia.upsert as ReturnType<typeof vi.fn>;
const pendenciaUpdateMany = prisma.pendencia.updateMany as ReturnType<typeof vi.fn>;

describe("darCiencia — resolve Pendencia correspondente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", oid: "oid1", nome: "Ana", email: "ana@aahbrant.com" });
    findUnique.mockResolvedValue({
      id: "p1",
      titulo: "Política de Teste",
      estado: "publicada",
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
    });
  });

  it("marca a Pendencia como resolvida com o mesmo politicaId/usuarioId/politicaPublicadaEm", async () => {
    const resultado = await darCiencia("p1", new Date(Date.now() - 10_000).toISOString());

    expect(resultado.ok).toBe(true);
    expect(pendenciaUpdateMany).toHaveBeenCalledWith({
      where: { politicaId: "p1", usuarioId: "u1", politicaPublicadaEm: new Date("2026-07-30T12:00:00Z"), estado: "pendente" },
      data: { estado: "resolvida", resolvidaEm: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/ciencia-actions.test.ts`
Expected: FAIL — `pendenciaUpdateMany` nunca é chamado hoje.

- [ ] **Step 3: Implementar**

Em `app/(shell)/catalogo/[id]/ciencia-actions.ts`, depois do
`await prisma.ciencia.upsert(...)` e antes do `await registrar(...)`:

```ts
  await prisma.pendencia.updateMany({
    where: { politicaId, usuarioId: usuario.id, politicaPublicadaEm: politica.publicadaEm!, estado: "pendente" },
    data: { estado: "resolvida", resolvidaEm: new Date() },
  });
```

(`politica.publicadaEm!` — o `!` é seguro aqui: a função já retornou cedo
se `politica.estado !== "publicada"`, e toda política publicada tem
`publicadaEm` setado.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/ciencia-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + lint + suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add app/\(shell\)/catalogo/\[id\]/ciencia-actions.ts tests/ciencia-actions.test.ts
git commit -m "feat(pendencia): darCiencia resolve a Pendencia correspondente"
```

---

### Task 5: Cancelar `Pendencia` ao revogar

**Files:**
- Modify: `app/(shell)/catalogo/[id]/estado-actions.ts`
- Test: `tests/estado-actions.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `revogarPolitica` cancela toda `Pendencia` `pendente` daquela
  política.

- [ ] **Step 1: Escrever o teste (falhando)**

No mesmo `describe` de pendência criado na Task 3 (ou um novo, no mesmo
arquivo `tests/estado-actions.test.ts`):

```ts
describe("revogarPolitica — cancela Pendencia pendente", () => {
  it("marca toda Pendencia pendente da politica como cancelada", async () => {
    findUnique.mockResolvedValue({ id: "p1", titulo: "Política de Teste", estado: "publicada" });
    politicaUpdate.mockResolvedValue({});

    const resultado = await revogarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(pendenciaUpdateMany).toHaveBeenCalledWith({
      where: { politicaId: "p1", estado: "pendente" },
      data: { estado: "cancelada" },
    });
  });
});
```

(Import `revogarPolitica` junto de `publicarPolitica` no topo do arquivo,
se ainda não estiver importado.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `revogarPolitica` (`estado-actions.ts`), depois do
`await prisma.politica.update(...)` e antes do `await registrar(...)`:

```ts
  await prisma.pendencia.updateMany({
    where: { politicaId: id, estado: "pendente" },
    data: { estado: "cancelada" },
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + lint + suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add app/\(shell\)/catalogo/\[id\]/estado-actions.ts tests/estado-actions.test.ts
git commit -m "feat(pendencia): revogarPolitica cancela pendencias em aberto"
```

---

### Task 6: Endpoint de contagem

**Files:**
- Create: `app/api/pendencias/contagem/route.ts`
- Test: `tests/api-pendencias-contagem.test.ts`

**Interfaces:**
- Consumes: `getUsuarioAtual()` (já existente).
- Produces: `GET /api/pendencias/contagem` → `200 { total: number, porTipo: Record<string, number> }`
  para o usuário autenticado; `401` sem sessão.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/api-pendencias-contagem.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { pendencia: { groupBy: vi.fn() } },
}));
vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { GET } from "@/app/api/pendencias/contagem/route";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const groupBy = prisma.pendencia.groupBy as ReturnType<typeof vi.fn>;

describe("GET /api/pendencias/contagem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna total e contagem por tipo do usuário autenticado", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    groupBy.mockResolvedValue([
      { tipo: "politica", _count: { _all: 3 } },
      { tipo: "manual", _count: { _all: 2 } },
    ]);

    const resposta = await GET();
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({ total: 5, porTipo: { politica: 3, manual: 2 } });
    expect(groupBy).toHaveBeenCalledWith({
      by: ["tipo"],
      where: { usuarioId: "u1", estado: "pendente" },
      _count: { _all: true },
    });
  });

  it("401 sem sessão", async () => {
    usuarioAtual.mockResolvedValue(null);
    const resposta = await GET();
    expect(resposta.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/api-pendencias-contagem.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/pendencias/contagem/route'`.

- [ ] **Step 3: Implementar**

Criar `app/api/pendencias/contagem/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioAtual();
  if (!usuario) return new NextResponse(null, { status: 401 });

  const grupos = await prisma.pendencia.groupBy({
    by: ["tipo"],
    where: { usuarioId: usuario.id, estado: "pendente" },
    _count: { _all: true },
  });

  const porTipo: Record<string, number> = {};
  let total = 0;
  for (const g of grupos) {
    porTipo[g.tipo] = g._count._all;
    total += g._count._all;
  }

  return NextResponse.json({ total, porTipo });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/api-pendencias-contagem.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: tsc + lint + suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add app/api/pendencias/contagem/route.ts tests/api-pendencias-contagem.test.ts
git commit -m "feat(pendencia): endpoint de contagem /api/pendencias/contagem"
```

---

### Task 7: Hook de polling no client (sem UI visual ainda)

**Files:**
- Create: `lib/hooks/usePendencias.ts`

**Interfaces:**
- Produces: `usePendencias(): { total: number; porTipo: Record<string, number>; carregando: boolean }`
  — hook client-side, busca `/api/pendencias/contagem` na montagem e a
  cada 30s.

Esta task não tem teste automatizado (hook de polling com `setInterval` e
`fetch` em componente client — sem `@testing-library/react` no projeto
hoje, e adicionar essa dependência só para esta task é desproporcional;
verificação é manual, via navegador, no Step 2). Se no futuro o projeto
adotar testing-library para hooks, este é candidato a ganhar teste.

- [ ] **Step 1: Implementar**

Criar `lib/hooks/usePendencias.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export type ContagemPendencias = { total: number; porTipo: Record<string, number> };

const INTERVALO_MS = 30_000;

// Polling simples (sem WebSocket — app roda em réplica única, ver
// docs/DEPLOY.md). Busca na montagem e a cada 30s; ver
// docs/superpowers/specs/2026-07-30-pendencias-ciencia-nucleo-design.md
// para a decisão. Fase B consome este hook nos badges/sino/painel.
export function usePendencias(): ContagemPendencias & { carregando: boolean } {
  const [dados, setDados] = useState<ContagemPendencias>({ total: 0, porTipo: {} });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      try {
        const resposta = await fetch("/api/pendencias/contagem");
        if (!resposta.ok || cancelado) return;
        const corpo: ContagemPendencias = await resposta.json();
        if (!cancelado) setDados(corpo);
      } catch (erro) {
        console.error("Falha ao buscar contagem de pendencias:", erro);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    buscar();
    const id = setInterval(buscar, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  return { ...dados, carregando };
}
```

- [ ] **Step 2: Verificação manual**

Com o dev server rodando (`npm run dev`) e `AUTH_PREVIEW_BYPASS="1"`
temporário (reverter para `""` depois — nunca deixar ligado): criar um
componente de teste temporário (não commitar) que usa `usePendencias()` e
imprime o resultado na tela, ou usar o console do navegador
(`fetch('/api/pendencias/contagem').then(r => r.json()).then(console.log)`)
pra confirmar que o endpoint responde com a contagem certa pro usuário
logado. Publicar uma política de teste (via UI) e confirmar que a
contagem sobe.

- [ ] **Step 3: tsc + lint**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
```

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/usePendencias.ts
git commit -m "feat(pendencia): hook usePendencias (polling 30s, sem UI ainda)"
```

---

### Task 8: Verificação final + PR

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte completa**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
npm run build
```

- [ ] **Step 2: Smoke test ponta a ponta**

Com Postgres local rodando e `AUTH_PREVIEW_BYPASS=1` temporário: publicar
uma política de teste com audiência restrita a um usuário conhecido,
confirmar (via Prisma Studio ou query direta) que uma `Pendencia` foi
criada para esse usuário com `estado: pendente`. Dar ciência dessa
política logada como esse usuário, confirmar que a `Pendencia` virou
`resolvida`. Reabrir e republicar a mesma política, confirmar que uma
NOVA `Pendencia` `pendente` foi criada e a antiga (já resolvida) não foi
afetada — só pendências ainda `pendente` são canceladas na republicação.
Revogar uma política com pendência em aberto, confirmar que virou
`cancelada`. Reverter `AUTH_PREVIEW_BYPASS` para `""` ao final.

- [ ] **Step 3: PR**

Branch a partir de `main` atualizado, PR com título
`feat(pendencia): nucleo de pendencias de ciencia (Fase A)`, descrição
linkando a spec e este plano. Aguardar aprovação + build policy antes de
completar o merge (mesmo fluxo das PRs anteriores desta sessão).
