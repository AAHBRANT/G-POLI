# Superfícies de UI de pendências de ciência (Fase B) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumir o núcleo de dados da Fase A (tabela `Pendencia`, endpoint
de contagem, hook `usePendencias`) em 4 superfícies visíveis: badges na
sidebar, sino de notificações no header, card na home, e toast na primeira
vez que o usuário vê uma publicação/republicação.

**Architecture:** Badges e sino reaproveitam o `usePendencias()` já
existente (polling 30s) para números ao vivo, sem query nova. Um endpoint
novo (`GET /api/pendencias/lista`) alimenta sob demanda (sem polling) o
conteúdo detalhado do dropdown do sino e do toast. Rastreio de "toast já
visto" é um campo novo no banco (`Pendencia.notificadaEm`), marcado por uma
Server Action best-effort. A home troca sua query antiga (`Politica`/
`Ciencia` direto, com bug de versão) pela tabela `Pendencia`.

**Tech Stack:** Next.js 14 (App Router, Route Handlers, Server Actions,
Client Components), Prisma 5.17/PostgreSQL, Vitest. Nenhuma dependência nova
(toast é componente custom).

## Global Constraints

- Nenhuma dependência nova (`package.json` não muda) — toast é componente
  custom, sem lib.
- Migração de schema: campo novo nullable (`notificadaEm DateTime?`), sem
  default — puramente aditivo.
- `Pendencia.usuarioId` é sempre o `id` (cuid) do usuário, nunca `oid` —
  mesma convenção da Fase A, confirmada correta em toda a base.
- Toda Server Action/rota nova que recebe um `id` de `Pendencia` do client
  DEVE filtrar por `usuarioId` da sessão no `where` — nunca confiar só no
  `id` recebido (evita IDOR).
- Badges/sino usam o `usePendencias()` já existente (polling 30s) — não
  criar um segundo polling. Dropdown do sino e toast buscam sob demanda
  (na abertura / no mount), sem polling próprio.
- Best-effort (try/catch com `console.error`, sem re-throw) em toda escrita
  que não seja o dado principal já commitado — mesmo padrão de
  `publicarPolitica`/`darCiencia`/`revogarPolitica` da Fase A.
- Todo código novo roda `npx tsc --noEmit`, `npx eslint . --ext .ts,.tsx` e
  `npx vitest run` limpos antes de cada commit.
- Sem infraestrutura de teste de componente/hook React neste projeto
  (`vitest.config.ts` usa `environment: "node"`, sem jsdom/testing-library)
  — componentes React novos (`Sidebar`, `SinoNotificacoes`,
  `ToastPendencias`) e o ajuste do hook `usePendencias` não têm teste
  automatizado; verificação é `tsc`/`eslint` limpos + checklist manual no
  browser na Task 9 (mesmo padrão da Fase A).

---

## Contexto que os tasks abaixo assumem conhecido

- `getUsuarioAtual()` (`lib/auth/usuario.ts`) retorna `UsuarioAtual | null`
  com `{ id: string | null, oid, nome, email, perfil, setores }`. `id` pode
  ser `null` mesmo com sessão válida (usuário ainda não provisionado
  localmente) — todo código novo guarda com `if (!usuario || !usuario.id)`,
  igual ao endpoint de contagem existente.
- `usePendencias()` (`lib/hooks/usePendencias.ts`) já existe: busca
  `/api/pendencias/contagem` no mount + a cada 30s, expõe
  `{ total, porTipo, carregando }`. A Task 1 desta fase adiciona `erro`
  a esse retorno.
- URL canônica de QUALQUER documento (dos 8 tipos) é sempre
  `/catalogo/${id}` — confirmado em `components/politica/CatalogoTabela.tsx:44`,
  `app/(shell)/busca/page.tsx:120`, `app/(shell)/page.tsx:104`. Não existe
  `/tipos/{tipo}/${id}`.
- Padrão de dropdown com fechamento ao clicar fora já existe em
  `components/shell/MenuPerfil.tsx:16-25` (`useState` + `useRef` +
  `useEffect` com `document.addEventListener("mousedown", ...)`) — o sino
  desta fase replica exatamente esse padrão.
- `Header.tsx` é um Server Component (`async function`), `Sidebar.tsx` já é
  `"use client"`. Componentes novos que usam hooks (`SinoNotificacoes`,
  `ToastPendencias`) precisam da própria diretiva `"use client"`, importados
  para dentro de Server Components — mesmo padrão que `MenuPerfil` já usa
  dentro de `Header.tsx`.
- `TIPOS_DOCUMENTO`/`tipoDocumento()` (`lib/constants.ts`) — 6 valores,
  cada um com `{ valor, rotulo, rotuloPlural, ... }`.
- `prisma.pendencia` (Fase A, já em `main`): campos
  `{ id, politicaId, usuarioId, politicaPublicadaEm, tipo, estado, criadaEm, resolvidaEm }`,
  relação `politica: Politica` via `politicaId`.

---

### Task 1: Migration — `Pendencia.notificadaEm`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260801120000_pendencia_notificada_em/migration.sql`

**Interfaces:**
- Produces: `Pendencia.notificadaEm: DateTime | null` no Prisma Client.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, no `model Pendencia` (linhas 193-207 hoje),
adicionar o campo depois de `resolvidaEm`:

```prisma
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
  notificadaEm        DateTime? // null = toast da Fase B ainda não mostrado

  @@unique([politicaId, usuarioId, politicaPublicadaEm])
  @@index([usuarioId, estado])
}
```

- [ ] **Step 2: Gerar e aplicar a migration**

```bash
DATABASE_URL=$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//;s/"//g')
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Copiar a saída para `prisma/migrations/20260801120000_pendencia_notificada_em/migration.sql`
(criar a pasta primeiro). Deve ser só:

```sql
-- AlterTable
ALTER TABLE "Pendencia" ADD COLUMN "notificadaEm" TIMESTAMP(3);
```

Depois:

```bash
npx prisma migrate deploy
npx prisma generate
```

Expected: migration aplicada sem erro, client regenerado, sem impacto em
linhas existentes (todas ficam com `notificadaEm = NULL`).

- [ ] **Step 3: Confirmar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros (campo ainda não é usado em nenhum lugar nesta task).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260801120000_pendencia_notificada_em
git commit -m "feat(schema): campo Pendencia.notificadaEm (rastreio de toast, Fase B)"
```

---

### Task 2: `usePendencias()` ganha `erro: boolean`

**Files:**
- Modify: `lib/hooks/usePendencias.ts`

**Interfaces:**
- Consumes: nada novo (mesmo `fetch("/api/pendencias/contagem")`).
- Produces: `usePendencias(): ContagemPendencias & { carregando: boolean; erro: boolean }`
  — `erro` é `true` quando a última tentativa de fetch falhou (rede OU
  resposta não-ok), `false` assim que uma busca tiver sucesso. Consumido
  pela Task 5 (badges) e Task 6 (sino) — nenhuma delas é obrigada a usar
  `erro` visualmente nesta fase, mas o tipo de retorno já precisa existir
  pra não quebrar quem vier depois (Fase C/D).

**Contexto**: hoje (`lib/hooks/usePendencias.ts:20-31`) uma resposta
não-ok é silenciosamente ignorada (`if (!resposta.ok || cancelado) return;`)
sem sinalizar erro pro consumidor — Minor triado na revisão final da Fase A,
fast-follow adiado pra esta fase porque badges/sino passam a depender
pesado deste hook.

- [ ] **Step 1: Editar o hook**

Substituir o corpo de `lib/hooks/usePendencias.ts` inteiro por:

```ts
"use client";

import { useEffect, useState } from "react";

export type ContagemPendencias = { total: number; porTipo: Record<string, number> };

const INTERVALO_MS = 30_000;

// Polling simples (sem WebSocket — app roda em réplica única, ver
// docs/DEPLOY.md). Busca na montagem e a cada 30s; ver
// docs/superpowers/specs/2026-07-30-pendencias-ciencia-nucleo-design.md
// para a decisão. Fase B consome este hook nos badges/sino/painel.
export function usePendencias(): ContagemPendencias & { carregando: boolean; erro: boolean } {
  const [dados, setDados] = useState<ContagemPendencias>({ total: 0, porTipo: {} });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      try {
        const resposta = await fetch("/api/pendencias/contagem");
        if (cancelado) return;
        if (!resposta.ok) {
          setErro(true);
          return;
        }
        const corpo: ContagemPendencias = await resposta.json();
        if (!cancelado) {
          setDados(corpo);
          setErro(false);
        }
      } catch (erroFetch) {
        console.error("Falha ao buscar contagem de pendencias:", erroFetch);
        if (!cancelado) setErro(true);
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

  return { ...dados, carregando, erro };
}
```

- [ ] **Step 2: Verificar compilação e lint**

Run: `npx tsc --noEmit && npx eslint lib/hooks/usePendencias.ts`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/usePendencias.ts
git commit -m "fix(hook): usePendencias sinaliza erro (rede ou resposta nao-ok)"
```

---

### Task 3: Endpoint `GET /api/pendencias/lista`

**Files:**
- Create: `app/api/pendencias/lista/route.ts`
- Test: `tests/api-pendencias-lista.test.ts`

**Interfaces:**
- Consumes: `getUsuarioAtual()`, `prisma.pendencia.findMany`.
- Produces: `export type ItemPendencia = { id, politicaId, titulo, codigo: string | null, tipo, publicadaEm: string, criadaEm: string, notificadaEm: string | null }`
  e `GET() -> NextResponse<{ itens: ItemPendencia[] }>`. Consumido pela
  Task 6 (sino) e Task 7 (toast) via `import type { ItemPendencia } from "@/app/api/pendencias/lista/route"`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/api-pendencias-lista.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { pendencia: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { GET } from "@/app/api/pendencias/lista/route";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const findMany = prisma.pendencia.findMany as ReturnType<typeof vi.fn>;

describe("GET /api/pendencias/lista", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna as pendencias do usuario autenticado, mais recentes primeiro", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    const publicadaEm = new Date("2026-07-30T12:00:00.000Z");
    const criadaEm = new Date("2026-07-31T09:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "pend1",
        politicaId: "p1",
        tipo: "politica",
        politicaPublicadaEm: publicadaEm,
        criadaEm,
        notificadaEm: null,
        politica: { titulo: "Política de Teste", codigo: "AHBT-POL-TI-001" },
      },
    ]);

    const resposta = await GET();
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({
      itens: [
        {
          id: "pend1",
          politicaId: "p1",
          titulo: "Política de Teste",
          codigo: "AHBT-POL-TI-001",
          tipo: "politica",
          publicadaEm: publicadaEm.toISOString(),
          criadaEm: criadaEm.toISOString(),
          notificadaEm: null,
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { usuarioId: "u1", estado: "pendente" },
      include: { politica: { select: { titulo: true, codigo: true } } },
      orderBy: { criadaEm: "desc" },
      take: 20,
    });
  });

  it("401 sem sessao", async () => {
    usuarioAtual.mockResolvedValue(null);
    const resposta = await GET();
    expect(resposta.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("401 quando usuario nao tem id (sessao valida mas nao provisionado)", async () => {
    usuarioAtual.mockResolvedValue({ id: null, oid: "oid1" });
    const resposta = await GET();
    expect(resposta.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/api-pendencias-lista.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/pendencias/lista/route'`.

- [ ] **Step 3: Implementar**

Criar `app/api/pendencias/lista/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

export type ItemPendencia = {
  id: string;
  politicaId: string;
  titulo: string;
  codigo: string | null;
  tipo: string;
  publicadaEm: string;
  criadaEm: string;
  notificadaEm: string | null;
};

export async function GET() {
  const usuario = await getUsuarioAtual();
  if (!usuario || !usuario.id) return new NextResponse(null, { status: 401 });

  const pendencias = await prisma.pendencia.findMany({
    where: { usuarioId: usuario.id, estado: "pendente" },
    include: { politica: { select: { titulo: true, codigo: true } } },
    orderBy: { criadaEm: "desc" },
    take: 20,
  });

  const itens: ItemPendencia[] = pendencias.map((p) => ({
    id: p.id,
    politicaId: p.politicaId,
    titulo: p.politica.titulo,
    codigo: p.politica.codigo,
    tipo: p.tipo,
    publicadaEm: p.politicaPublicadaEm.toISOString(),
    criadaEm: p.criadaEm.toISOString(),
    notificadaEm: p.notificadaEm ? p.notificadaEm.toISOString() : null,
  }));

  return NextResponse.json({ itens });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/api-pendencias-lista.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint app/api/pendencias/lista/route.ts`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add app/api/pendencias/lista/route.ts tests/api-pendencias-lista.test.ts
git commit -m "feat(api): GET /api/pendencias/lista"
```

---

### Task 4: Server Action `marcarPendenciaNotificada`

**Files:**
- Create: `app/(shell)/pendencia-actions.ts`
- Test: `tests/pendencia-actions.test.ts`

**Interfaces:**
- Consumes: `getUsuarioAtual()`, `prisma.pendencia.update`.
- Produces: `marcarPendenciaNotificada(pendenciaId: string): Promise<void>`.
  Consumida pela Task 7 (toast), via
  `import { marcarPendenciaNotificada } from "@/app/(shell)/pendencia-actions"`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/pendencia-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { pendencia: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/usuario", () => ({ getUsuarioAtual: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { marcarPendenciaNotificada } from "@/app/(shell)/pendencia-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const pendenciaUpdate = prisma.pendencia.update as ReturnType<typeof vi.fn>;

describe("marcarPendenciaNotificada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca notificadaEm filtrando pelo id da pendencia E usuarioId da sessao (evita IDOR)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    pendenciaUpdate.mockResolvedValue({});

    await marcarPendenciaNotificada("pend1");

    expect(pendenciaUpdate).toHaveBeenCalledWith({
      where: { id: "pend1", usuarioId: "u1" },
      data: { notificadaEm: expect.any(Date) },
    });
  });

  it("sem sessao (ou sem usuario.id), nao chama o banco", async () => {
    usuarioAtual.mockResolvedValue(null);
    await marcarPendenciaNotificada("pend1");
    expect(pendenciaUpdate).not.toHaveBeenCalled();
  });

  it("falha do update (pendencia de outro usuario, P2025) nao lanca (best-effort)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    pendenciaUpdate.mockRejectedValue(new Error("Record to update not found."));

    await expect(marcarPendenciaNotificada("pend1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/pendencia-actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/(shell)/pendencia-actions'`.

- [ ] **Step 3: Implementar**

Criar `app/(shell)/pendencia-actions.ts`:

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

// Best-effort: o toast já fechou no client independente do resultado aqui.
// `where` combina id (único) + usuarioId — sem isso, um usuário poderia
// marcar como notificada a pendência de outro (IDOR). Se não achar (P2025:
// pendência de outro usuário, ou id inexistente), é no-op silencioso.
export async function marcarPendenciaNotificada(pendenciaId: string): Promise<void> {
  const usuario = await getUsuarioAtual();
  if (!usuario || !usuario.id) return;

  try {
    await prisma.pendencia.update({
      where: { id: pendenciaId, usuarioId: usuario.id },
      data: { notificadaEm: new Date() },
    });
  } catch (erro) {
    console.error("Falha ao marcar pendencia como notificada:", erro);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/pendencia-actions.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint "app/(shell)/pendencia-actions.ts"`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "app/(shell)/pendencia-actions.ts" tests/pendencia-actions.test.ts
git commit -m "feat(action): marcarPendenciaNotificada (best-effort, guard IDOR)"
```

---

### Task 5: Badges na sidebar

**Files:**
- Modify: `components/shell/Sidebar.tsx`

**Interfaces:**
- Consumes: `usePendencias()` (Task 2) — `{ total, porTipo, carregando }`.
- Produces: nada consumido por tasks seguintes (é folha da árvore de UI).

**Sem teste automatizado** (ver Global Constraints — sem jsdom/testing-library
neste projeto). Verificação: `tsc`/`eslint` limpos + checklist manual na
Task 9.

- [ ] **Step 1: Editar `components/shell/Sidebar.tsx`**

Substituir o arquivo inteiro por:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "@/components/shell/Brand";
import { TIPOS_DOCUMENTO } from "@/lib/constants";
import { usePendencias } from "@/lib/hooks/usePendencias";

const painel = { nome: "Painel", href: "/", icone: "M3 12l9-9 9 9M5 10v10h14V10" };

// v3: um item de menu por tipo de documento, cada um com sua seção própria
// (mesmo padrão que "Catálogo de Normas" já tinha). Política mantém a rota
// /catalogo, que já existia; os outros 7 vão para /tipos/[tipo] — página
// genérica, um arquivo só. Ícone único de documento para os 8 (evita 8 ícones
// sob medida sem necessidade real ainda).
const ICONE_DOCUMENTO = "M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 13h6M9 17h6";
const documentos = TIPOS_DOCUMENTO.map((t) => ({
  nome: t.rotuloPlural,
  href: t.valor === "politica" ? "/catalogo" : `/tipos/${t.valor}`,
  icone: ICONE_DOCUMENTO,
  valor: t.valor,
}));

const ferramentas = [
  { nome: "Publicação", href: "/publicacao", icone: "M5 13l4 4L19 7" },
  { nome: "Busca", href: "/busca", icone: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" },
];

const admin = [
  { nome: "Administração", href: "/admin", icone: "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M12 4v2m0 12v2" },
  { nome: "Suporte Inteligente", href: "/suporte", icone: "M8 10h8M8 14h5M21 12a9 9 0 11-3.5-7.1L21 3v9z", futuro: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { total, porTipo, carregando } = usePendencias();

  const item = (m: { nome: string; href: string; icone: string; futuro?: boolean; badge?: number }) => {
    const ativo = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
    // Indicador de item ativo é uma barra lateral (borda), não preenchimento de
    // fundo — mais discreto, mesmo padrão pros itens normais e o de admin.
    const base = "flex items-center gap-3 rounded-md border-l-2 px-3 py-1.5 text-sm transition";
    const ico = (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d={m.icone} />
      </svg>
    );
    const badge = m.badge ? (
      <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {m.badge}
      </span>
    ) : null;
    if (m.futuro) {
      return (
        <span key={m.nome} title="Próximo incremento" className={`${base} cursor-not-allowed border-transparent text-white/35`}>
          {ico}
          {m.nome}
          <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">em breve</span>
        </span>
      );
    }
    return (
      <Link
        key={m.nome}
        href={m.href}
        className={`${base} ${ativo ? "border-bege bg-white/10 font-medium text-white" : "border-transparent text-white/75 hover:bg-white/5 hover:text-white"}`}
      >
        {ico}
        {m.nome}
        {badge}
      </Link>
    );
  };

  const rotulo = (texto: string) => (
    <div className="mb-1 mt-4 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-bege/70 first:mt-0">
      {texto}
    </div>
  );

  return (
    <aside className="flex w-64 flex-col justify-between bg-gradient-to-b from-marsala to-marsala-800 text-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <Brand size="md" invertido />
        </div>
        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {item({ ...painel, badge: !carregando && total > 0 ? total : undefined })}
          {rotulo("Documentos")}
          <div className="space-y-1">
            {documentos.map((d) => item({ ...d, badge: !carregando && porTipo[d.valor] > 0 ? porTipo[d.valor] : undefined }))}
          </div>
          {rotulo("Ferramentas")}
          <div className="space-y-1">{ferramentas.map(item)}</div>
        </nav>
      </div>
      <div className="px-3 pb-5">
        <div className="mb-1 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-bege/70">
          Administrativo
        </div>
        <div className="space-y-1">{admin.map(item)}</div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verificar compilação e lint**

Run: `npx tsc --noEmit && npx eslint components/shell/Sidebar.tsx`
Expected: sem erros.

- [ ] **Step 3: Rodar suíte completa (garantir nenhuma regressão)**

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando (este componente
não tem teste próprio, mas não deve quebrar nada mockado em outro lugar).

- [ ] **Step 4: Commit**

```bash
git add components/shell/Sidebar.tsx
git commit -m "feat(sidebar): badges de pendencia por tipo de documento + total no Painel"
```

---

### Task 6: Sino de notificações no header

**Files:**
- Create: `components/shell/SinoNotificacoes.tsx`
- Modify: `components/shell/Header.tsx`

**Interfaces:**
- Consumes: `usePendencias()` (Task 2), `GET /api/pendencias/lista` (Task 3,
  tipo `ItemPendencia`), `tipoDocumento()` (`lib/constants.ts`, já existente).
- Produces: nada consumido por tasks seguintes.

**Sem teste automatizado** (mesma razão da Task 5). Verificação:
`tsc`/`eslint` limpos + checklist manual na Task 9.

- [ ] **Step 1: Criar `components/shell/SinoNotificacoes.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePendencias } from "@/lib/hooks/usePendencias";
import { tipoDocumento } from "@/lib/constants";
import type { ItemPendencia } from "@/app/api/pendencias/lista/route";

export default function SinoNotificacoes() {
  const { total, carregando } = usePendencias();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemPendencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Mesmo padrão de fechar-ao-clicar-fora de components/shell/MenuPerfil.tsx.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function alternar() {
    const proximoAberto = !aberto;
    setAberto(proximoAberto);
    if (!proximoAberto) return;

    setBuscando(true);
    try {
      const resposta = await fetch("/api/pendencias/lista");
      if (resposta.ok) {
        const corpo: { itens: ItemPendencia[] } = await resposta.json();
        setItens(corpo.itens);
      }
    } catch (erro) {
      console.error("Falha ao buscar lista de pendencias:", erro);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={alternar} className="relative rounded-full p-2 transition hover:bg-black/5" aria-label="Notificações">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
        {!carregando && total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1 text-[9px] font-medium text-white">
            {total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border border-black/10 bg-white py-1 shadow-premium">
          <div className="border-b border-black/5 px-3 py-2 text-[11px] uppercase tracking-wide text-black/40">
            Pendências{itens.length > 0 ? ` (${itens.length})` : ""}
          </div>
          {buscando ? (
            <p className="px-3 py-4 text-center text-sm text-black/40">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-black/40">Nenhuma pendência.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {itens.map((it) => (
                <li key={it.id} className="border-t border-black/5 first:border-t-0">
                  <Link href={`/catalogo/${it.politicaId}`} className="block px-3 py-2 hover:bg-black/5">
                    <div className="text-sm text-black/80">{it.titulo}</div>
                    <div className="mt-0.5 text-[11px] text-black/40">{tipoDocumento(it.tipo).rotulo}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Inserir no header**

Em `components/shell/Header.tsx`, adicionar o import (junto dos outros,
linha 5) e renderizar antes do `MenuPerfil` (linhas 47-54):

```tsx
import SinoNotificacoes from "@/components/shell/SinoNotificacoes";
```

```tsx
        {u && <SinoNotificacoes />}

        {u && (
          <MenuPerfil
            nome={nomeExibicao}
            cargoRotulo={rotuloCargo(u.perfil)}
            iniciais={iniciais(u.nome ?? "", u.email ?? "")}
            authEnabled={authEnabled}
          />
        )}
```

- [ ] **Step 3: Verificar compilação e lint**

Run: `npx tsc --noEmit && npx eslint components/shell/SinoNotificacoes.tsx components/shell/Header.tsx`
Expected: sem erros.

- [ ] **Step 4: Rodar suíte completa**

Run: `npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add components/shell/SinoNotificacoes.tsx components/shell/Header.tsx
git commit -m "feat(header): sino de notificacoes com dropdown de pendencias"
```

---

### Task 7: Toast de primeira visualização

**Files:**
- Create: `components/shell/ToastPendencias.tsx`
- Modify: `app/(shell)/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/pendencias/lista` (Task 3), `marcarPendenciaNotificada`
  (Task 4).
- Produces: nada consumido por tasks seguintes.

**Sem teste automatizado** (mesma razão da Task 5). Verificação:
`tsc`/`eslint` limpos + checklist manual na Task 9 (incluindo o cenário de
2 abas/reloads pra confirmar que o toast não repete depois de marcado).

- [ ] **Step 1: Criar `components/shell/ToastPendencias.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ItemPendencia } from "@/app/api/pendencias/lista/route";
import { marcarPendenciaNotificada } from "@/app/(shell)/pendencia-actions";

const DURACAO_MS = 6000;

// Monta uma vez por carregamento do shell (ver app/(shell)/layout.tsx).
// Mostra no máximo 1 toast por carregamento — mesmo com várias pendências
// não notificadas, evita empilhar spam; as demais aparecem no sino/home.
export default function ToastPendencias() {
  const [item, setItem] = useState<ItemPendencia | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      try {
        const resposta = await fetch("/api/pendencias/lista");
        if (!resposta.ok || cancelado) return;
        const corpo: { itens: ItemPendencia[] } = await resposta.json();
        const naoNotificada = corpo.itens.find((it) => !it.notificadaEm);
        if (naoNotificada && !cancelado) {
          setItem(naoNotificada);
          marcarPendenciaNotificada(naoNotificada.id);
        }
      } catch (erro) {
        console.error("Falha ao buscar pendencia para toast:", erro);
      }
    }

    buscar();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    const id = setTimeout(() => setItem(null), DURACAO_MS);
    return () => clearTimeout(id);
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg bg-marsala px-4 py-3 shadow-premium">
      <span className="flex-1 text-sm text-white">
        <Link href={`/catalogo/${item.politicaId}`} className="underline hover:no-underline">
          {item.titulo}
        </Link>{" "}
        foi publicada. Confirme sua ciência.
      </span>
      <button onClick={() => setItem(null)} aria-label="Fechar" className="text-bege/80 hover:text-white">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Montar no shell**

Em `app/(shell)/layout.tsx`, adicionar o import e renderizar como irmão do
`<div className="flex flex-1 flex-col">` (o toast é `position: fixed`,
então sua posição no DOM não afeta onde aparece na tela):

```tsx
import ToastPendencias from "@/components/shell/ToastPendencias";
```

```tsx
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
      <ToastPendencias />
    </div>
  );
```

- [ ] **Step 3: Verificar compilação e lint**

Run: `npx tsc --noEmit && npx eslint components/shell/ToastPendencias.tsx "app/(shell)/layout.tsx"`
Expected: sem erros.

- [ ] **Step 4: Rodar suíte completa**

Run: `npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add components/shell/ToastPendencias.tsx "app/(shell)/layout.tsx"
git commit -m "feat(toast): notificacao de primeira visualizacao apos publicacao"
```

---

### Task 8: Home — trocar a fonte da seção "Aguardando sua ciência"

**Files:**
- Modify: `app/(shell)/page.tsx:71-112`

**Interfaces:**
- Consumes: `prisma.pendencia.findMany`.
- Produces: nada consumido por tasks seguintes.

**Decisão de teste**: o projeto não tem convenção pra testar `page.tsx`
(server component) — ver Task 9 do plano da Fase A / exploração desta fase.
Extrair a query pra uma função separada só pra ganhar testabilidade seria
uma abstração nova sem outro consumidor (YAGNI). Fica sem teste
automatizado; a Task 9 cobre manualmente o cenário que substitui (login
como colaborador com pendência real, comparar com o que a home mostra).

- [ ] **Step 1: Editar a query**

Em `app/(shell)/page.tsx`, substituir (linhas 71-83 hoje):

```tsx
    const pendentesCiencia = usuario
      ? await prisma.politica.findMany({
          where: {
            AND: [
              { estado: "publicada" },
              filtroVisibilidade(usuario),
              { ciencias: { none: { usuarioOid: usuario.oid } } },
            ],
          },
          orderBy: { publicadaEm: "desc" },
          take: 8,
        })
      : [];
```

por:

```tsx
    // v3 (Fase B): fonte única de verdade é a tabela Pendencia (por versão),
    // não mais Politica/Ciencia direto — a query antiga ignorava versão
    // (bug corrigido na Fase A no gate de "já ciente" da página do
    // documento; aqui era a mesma classe de bug, na home).
    const pendentesCiencia =
      usuario && usuario.id
        ? await prisma.pendencia.findMany({
            where: { usuarioId: usuario.id, estado: "pendente" },
            include: { politica: { select: { id: true, titulo: true } } },
            orderBy: { criadaEm: "desc" },
            take: 8,
          })
        : [];
```

- [ ] **Step 2: Editar a renderização**

Substituir (linhas 101-110 hoje):

```tsx
            <ul className="divide-y divide-black/5">
              {pendentesCiencia.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/catalogo/${p.id}`} className="font-medium text-marsala hover:underline">{p.titulo}</Link>
                  <span className="text-xs text-black/40">
                    publicada {p.publicadaEm ? tempoRelativo(p.publicadaEm) : ""}
                  </span>
                </li>
              ))}
            </ul>
```

por:

```tsx
            <ul className="divide-y divide-black/5">
              {pendentesCiencia.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/catalogo/${p.politica.id}`} className="font-medium text-marsala hover:underline">{p.politica.titulo}</Link>
                  <span className="text-xs text-black/40">
                    publicada {tempoRelativo(p.politicaPublicadaEm)}
                  </span>
                </li>
              ))}
            </ul>
```

Nota: `Pendencia.politicaPublicadaEm` nunca é `null` (diferente de
`Politica.publicadaEm`, que é `null` em rascunho) — o `? :` de fallback do
código antigo não é mais necessário.

- [ ] **Step 3: Verificar compilação e lint**

Run: `npx tsc --noEmit && npx eslint "app/(shell)/page.tsx"`
Expected: sem erros. Se `filtroVisibilidade` ficar sem uso no ramo
colaborador, confirmar que ainda é usado no ramo `veTudo` mais abaixo no
mesmo arquivo (é — linha 63) antes de considerar remover o import.

- [ ] **Step 4: Rodar suíte completa**

Run: `npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add "app/(shell)/page.tsx"
git commit -m "fix(home): secao Aguardando sua ciencia usa Pendencia (corrige bug de versao)"
```

---

### Task 9: Verificação final + PR

**Files:** nenhum novo — checklist de fechamento.

- [ ] **Step 1: Suíte completa**

Run: `npx vitest run && npx tsc --noEmit && npx eslint . --ext .ts,.tsx`
Expected: tudo limpo.

- [ ] **Step 2: `prisma migrate status`**

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 3: Checklist manual no browser** (dev server, `AUTH_PREVIEW_BYPASS`
  ligado temporariamente se necessário — lembrar de reverter em `.env`
  antes de terminar, mesma disciplina da Fase A)

  - [ ] Login como colaborador com ao menos 2 pendências de tipos
    diferentes: badge aparece em cada tipo certo na sidebar + total no
    "Painel".
  - [ ] Sino no header mostra o mesmo total; abrir mostra a lista com
    título + tipo de cada pendência, link leva pro documento certo
    (`/catalogo/[id]`).
  - [ ] Home mostra a mesma lista de pendências na seção "Aguardando sua
    ciência", agora vinda de `Pendencia`.
  - [ ] Toast aparece no primeiro carregamento de página com uma
    pendência não notificada; recarregar a página depois NÃO mostra o
    mesmo toast de novo (confirma que `marcarPendenciaNotificada`
    funcionou).
  - [ ] Dar ciência de uma pendência: badge/sino/home refletem a resolução
    dentro de 30s, sem reload manual (polling).
  - [ ] Republicar uma norma que o usuário já tinha ciência: pendência
    nova aparece nas 4 superfícies, e o toast dispara de novo pra essa
    nova versão (é uma `Pendencia` com `id` diferente, `notificadaEm`
    nulo).
  - [ ] Fechar o toast manualmente (botão "x") e clicar fora do sino
    fecha o dropdown.
  - [ ] Confirmar que `AUTH_PREVIEW_BYPASS` está revertido em `.env`
    (`grep AUTH_PREVIEW_BYPASS .env` deve mostrar vazio) antes de seguir.

- [ ] **Step 4: Commit final (se o checklist manual revelar algum ajuste)**

Se o checklist acima não pedir nenhuma correção, não há commit nesta step
— as Tasks 1-8 já cobrem tudo. Se pedir, corrigir e commitar normalmente
antes de prosseguir pra revisão final do branch (fora deste plano — ver
skill `subagent-driven-development`, etapa de revisão final).
