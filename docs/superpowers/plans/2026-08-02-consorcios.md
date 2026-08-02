# Consórcios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um documento seja destinado a AAHBRANT (todos) ou a um único consórcio
cadastrado, restringindo a visibilidade a quem está vinculado a esse consórcio.

**Architecture:** Nova entidade `Consorcio`, paralela e independente de `Area`/Setor. `Usuario`
ganha relação N:N com `Consorcio` (igual a `setores` hoje). `Politica` ganha `consorcioId`
opcional (`null` = AAHBRANT/todos). `filtroVisibilidade` (RBAC puro) passa a considerar
consórcio nos dois níveis não-privilegiados (Gestor de Setor e colaborador). Gestão (CRUD de
consórcio + vínculo de usuário) é exclusiva de Super Admin, espelhando o padrão já existente
para Setores.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, Vitest.

## Global Constraints

- Setor e Consórcio coexistem — usuário pode ter os dois ao mesmo tempo.
- Um documento tem um único destino: AAHBRANT (todos, `consorcioId = null`) OU exatamente um
  consórcio. Nunca vários.
- Consórcio é entidade própria, não reaproveita `Area`.
- Gestão de consórcio (criar/editar/ativar/desativar + vincular usuário) é só Super Admin.
- Ao escolher consórcio como destino, o seletor de público-alvo (`AudienciaSelector`) não
  aparece — o consórcio já define sozinho quem vê.
- Gestor de Setor (perfil `area`) fica restrito por consórcio igual ao colaborador comum,
  EXCETO para documentos do próprio setor dele (sempre visíveis, rascunho incluso).
- Super Admin / Admin / SGI / Diretoria continuam vendo tudo, sem mudança.
- Fora de escopo: multi-consórcio por documento, combinar consórcio com público-alvo granular,
  consórcio no formulário de convite, trocar destino depois de criado, perfil "Gestor de
  Consórcio".
- Repositório usa Azure DevOps (`az repos pr create`), não GitHub.

---

### Task 1: Modelo de dados — Consorcio + relações

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration em `prisma/migrations/` (via `npx prisma migrate dev`)

**Interfaces:**
- Produces: model `Consorcio { id, nome, ativo, membros, politicas, criadoEm }`; campo
  `Usuario.consorcios Consorcio[]`; campo `Politica.consorcioId String?` + relação
  `Politica.consorcio Consorcio?`.

- [ ] **Step 1: Adicionar o model `Consorcio` e as relações em `prisma/schema.prisma`**

Logo abaixo do model `Area` (que termina em `criadoEm DateTime @default(now())`, por volta da
linha 85), adicionar:

```prisma
// Empresa/consórcio externo (obra em parceria) — dimensão de destino de
// documento independente de Setor interno. Documento com consorcioId
// preenchido só é visível a quem está vinculado a este consórcio (ver
// filtroVisibilidade em lib/auth/rbac.ts).
model Consorcio {
  id        String     @id @default(cuid())
  nome      String     @unique
  ativo     Boolean    @default(true)
  membros   Usuario[]  @relation("UsuarioConsorcios")
  politicas Politica[]
  criadoEm  DateTime   @default(now())
}
```

No model `Usuario`, logo abaixo da linha `setores   Area[]   @relation("UsuarioSetores") // N:N — setores do usuário`,
adicionar:

```prisma
  consorcios Consorcio[] @relation("UsuarioConsorcios") // N:N — consórcios externos do usuário
```

No model `Politica`, logo abaixo do campo `areaId String`, adicionar:

```prisma
  // null = AAHBRANT (todos); preenchido = só quem está vinculado a este consórcio (ver spec
  // docs/superpowers/specs/2026-08-02-consorcios-design.md).
  consorcio     Consorcio?     @relation(fields: [consorcioId], references: [id])
  consorcioId   String?
```

- [ ] **Step 2: Gerar a migration**

Run: `npx prisma migrate dev --name consorcios`
Expected: cria `prisma/migrations/<timestamp>_consorcios/migration.sql` (CREATE TABLE
"Consorcio", tabela de junção `_UsuarioConsorcios`, ALTER TABLE "Politica" ADD COLUMN
"consorcioId"), aplica no banco local, roda `prisma generate` automaticamente.

- [ ] **Step 3: Verificar que o client gerado compila**

Run: `npx tsc --noEmit`
Expected: sem erros (o schema novo é aditivo, nada existente referencia campos que mudaram de
tipo).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): modelo Consorcio + Usuario.consorcios + Politica.consorcioId"
```

---

### Task 2: RBAC puro — podeGerirConsorcios + filtroVisibilidade por consórcio

**Files:**
- Modify: `lib/auth/rbac.ts`
- Test: `tests/rbac.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (função pura, sem Prisma).
- Produces: `UsuarioAtual` ganha campo `consorcios: string[]`; nova função
  `podeGerirConsorcios(u: UsuarioAtual | null): boolean`; `filtroVisibilidade` passa a
  considerar consórcio.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `tests/rbac.test.ts`, dentro do `describe("administração e visibilidade", ...)`
existente (a função `u()` no topo do arquivo precisa aceitar o novo parâmetro — ver Step 2):

```ts
it("podeGerirConsorcios: só super", () => {
  expect(podeGerirConsorcios(u("admin"))).toBe(false);
  expect(podeGerirConsorcios(u("superadmin"))).toBe(true);
});

it("filtroVisibilidade: area com setor mas fora do consórcio do documento não vê (exceto se for do próprio setor)", () => {
  // area do setor s1, sem consórcio algum vinculado — a implementação é incondicional
  // (Step 4), então a 3ª cláusula aparece mesmo com consorcios=[] (nunca bate com
  // nada nesse caso, mas o shape do objeto é sempre o mesmo — ver nota após o Step 4).
  expect(filtroVisibilidade(u("area", ["s1"]))).toEqual({
    OR: [
      { estado: "publicada", consorcioId: null },
      { estado: "publicada", consorcioId: { in: [] } },
      { areaId: { in: ["s1"] } },
    ],
  });
});

it("filtroVisibilidade: area vinculada ao consórcio também vê publicada daquele consórcio", () => {
  expect(filtroVisibilidade(u("area", ["s1"], ["c1"]))).toEqual({
    OR: [
      { estado: "publicada", consorcioId: null },
      { estado: "publicada", consorcioId: { in: ["c1"] } },
      { areaId: { in: ["s1"] } },
    ],
  });
});

it("colaborador sem consórcio: só publicada sem consórcio, dentro do público-alvo de sempre", () => {
  const semPublicoAlvo = { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } };
  expect(filtroVisibilidade(u("colaborador"))).toEqual({
    OR: [
      {
        estado: "publicada",
        consorcioId: null,
        OR: [semPublicoAlvo, { audienciaUsuarios: { some: { id: "1" } } }],
      },
      { estado: "publicada", consorcioId: { in: [] } },
    ],
  });
});

it("colaborador vinculado ao consórcio vê publicada daquele consórcio, sem checar público-alvo", () => {
  expect(filtroVisibilidade(u("colaborador", [], ["c1", "c2"]))).toEqual({
    OR: [
      {
        estado: "publicada",
        consorcioId: null,
        OR: [
          { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } },
          { audienciaUsuarios: { some: { id: "1" } } },
        ],
      },
      { estado: "publicada", consorcioId: { in: ["c1", "c2"] } },
    ],
  });
});
```

- [ ] **Step 2: Atualizar o helper `u()` no topo de `tests/rbac.test.ts` para aceitar consórcios**

```ts
const u = (perfil: Perfil, setores: string[] = [], consorcios: string[] = []): UsuarioAtual => ({
  id: "1", oid: "o", nome: "T", email: "t@aahbrant.com", perfil, setores, consorcios,
});
```

Também importar `podeGerirConsorcios` no topo do arquivo, junto dos outros imports de
`@/lib/auth/rbac`.

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/rbac.test.ts`
Expected: FAIL — `podeGerirConsorcios is not a function`, `UsuarioAtual` sem campo `consorcios`,
e os testes de `filtroVisibilidade` batendo com o formato antigo (sem `consorcioId`).

- [ ] **Step 4: Implementar em `lib/auth/rbac.ts`**

No tipo `UsuarioAtual` (linha 6-13), adicionar o campo:

```ts
export type UsuarioAtual = {
  id: string | null;
  oid: string;
  nome: string;
  email: string;
  perfil: Perfil;
  setores: string[]; // ids dos setores (Area) vinculados ao usuário
  consorcios: string[]; // ids dos consórcios vinculados ao usuário
};
```

Logo abaixo de `podeGerirSetores` (linha 45-47), adicionar:

```ts
// Gerir consórcios (criar/editar/ativar + vincular usuário): só Super Admin — mesma régua de Setores.
export function podeGerirConsorcios(u: UsuarioAtual | null): boolean {
  return ehSuper(u);
}
```

Substituir a função `filtroPublicadaPorAudiencia` (linhas 101-107) por:

```ts
// Publicada + dentro do público-alvo da política: audiência vazia (setor E
// usuário nenhum selecionado) = visível a todos, mesma semântica de
// audienciaVazia() em lib/politica/dominio.ts. Documento com consorcioId
// preenchido ignora o público-alvo por setor/usuário — o consórcio já
// define sozinho quem vê (ver spec docs/superpowers/specs/2026-08-02-consorcios-design.md).
function filtroPublicadaPorAudiencia(u: UsuarioAtual | null): Record<string, unknown> {
  const semPublicoAlvo = { audienciaSetores: { none: {} }, audienciaUsuarios: { none: {} } };
  const OR: Record<string, unknown>[] = [semPublicoAlvo];
  if (u?.setores.length) OR.push({ audienciaSetores: { some: { id: { in: u.setores } } } });
  if (u?.id) OR.push({ audienciaUsuarios: { some: { id: u.id } } });
  return {
    OR: [
      { estado: "publicada", consorcioId: null, OR },
      { estado: "publicada", consorcioId: { in: u?.consorcios ?? [] } },
    ],
  };
}
```

Substituir a função `filtroVisibilidade` (linhas 113-119) por:

```ts
// Visibilidade (busca/catálogo). super/admin/sgi/diretoria: tudo. area COM
// setor: publicadas sem consórcio (irrestrito) + publicadas do(s) consórcio(s)
// vinculado(s) + rascunhos/publicadas do próprio setor (gestão do próprio
// departamento, sempre visível independente de consórcio). Resto
// (colaborador; area sem setor): só publicadas DENTRO do próprio público-alvo
// (sem consórcio) ou do consórcio vinculado.
export function filtroVisibilidade(u: UsuarioAtual | null): Record<string, unknown> {
  if (u && (ehAdminOuSuper(u) || u.perfil === "sgi" || u.perfil === "diretoria")) return {};
  if (u && u.perfil === "area" && u.setores.length) {
    return {
      OR: [
        { estado: "publicada", consorcioId: null },
        { estado: "publicada", consorcioId: { in: u.consorcios } },
        { areaId: { in: u.setores } },
      ],
    };
  }
  return filtroPublicadaPorAudiencia(u);
}
```

Note: quando `u.consorcios` é `[]` (usuário sem consórcio nenhum), a cláusula
`consorcioId: { in: [] }` nunca bate com nada (Prisma trata `in: []` como sempre-falso) — é o
comportamento correto: sem consórcio vinculado, nenhum documento de consórcio aparece.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/rbac.test.ts`
Expected: PASS (todos, incluindo os pré-existentes — os testes antigos de `filtroVisibilidade`
para `area`/`colaborador` sem consórcio nenhum precisam ser atualizados para o novo formato de
retorno; ajustar os `toEqual` existentes das linhas ~104-107 e ~112-124 do arquivo original para
o novo shape, seguindo o mesmo padrão dos testes novos acima).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/rbac.ts tests/rbac.test.ts
git commit -m "feat(rbac): podeGerirConsorcios + filtroVisibilidade considera consórcio"
```

---

### Task 3: getUsuarioAtual carrega consórcios

**Files:**
- Modify: `lib/auth/usuario.ts`

**Interfaces:**
- Consumes: `UsuarioAtual.consorcios` (Task 2).
- Produces: `getUsuarioAtual()` preenche `consorcios` a partir do Prisma.

- [ ] **Step 1: Atualizar `getUsuarioAtual` em `lib/auth/usuario.ts`**

No branch de dev (auth desligada, linhas 65-73), adicionar o campo (sempre vazio — o cookie de
perfil dev não simula vínculo de consórcio, fora do escopo de teste manual):

```ts
  if (!authEnabled) {
    const perfil = (cookies().get(DEV_PERFIL_COOKIE)?.value as Perfil) || "superadmin";
    let setores: string[] = [];
    if (perfil === "area") {
      const a = await prisma.area.findFirst({ orderBy: { criadoEm: "asc" } });
      if (a) setores = [a.id];
    }
    return { id: "dev", oid: "dev", nome: "Dev", email: "dev@local", perfil, setores, consorcios: [] };
  }
```

No branch real (linhas 77-89), incluir o relacionamento na query e no retorno:

```ts
  const u = await prisma.usuario.findUnique({
    where: { oid: sessao.sub },
    include: {
      setores: { select: { id: true } },
      consorcios: { select: { id: true } },
    },
  });
  if (!u || !u.ativo) return null;
  return {
    id: u.id,
    oid: u.oid ?? sessao.sub,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil as Perfil,
    setores: u.setores.map((s) => s.id),
    consorcios: u.consorcios.map((c) => c.id),
  };
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte inteira (garante que nada que consumia `UsuarioAtual` quebrou)**

Run: `npx vitest run`
Expected: PASS em todos os arquivos (qualquer teste que construía `UsuarioAtual` manualmente
sem o campo `consorcios` precisa do campo adicionado — revisar `tests/*.test.ts` que importam
`UsuarioAtual` ou usam um helper tipo `u()`/`admin()`/`gestorSetor()` local e ajustar).

- [ ] **Step 4: Commit**

```bash
git add lib/auth/usuario.ts
git commit -m "feat(auth): getUsuarioAtual carrega consórcios do usuário"
```

---

### Task 4: Server Actions de gestão de consórcio

**Files:**
- Create: `app/(shell)/admin/consorcio-actions.ts`
- Modify: `app/(shell)/admin/actions.ts` (nova função `definirConsorcios`)
- Test: `tests/consorcio-actions.test.ts` (novo)
- Test: `tests/admin-actions.test.ts` (adiciona `describe("definirConsorcios", ...)`)

**Interfaces:**
- Consumes: `podeGerirConsorcios` (Task 2), `getUsuarioAtual` (Task 3).
- Produces: `criarConsorcio(nome: string)`, `renomearConsorcio(id: string, nome: string)`,
  `alternarConsorcioAtivo(id: string, ativo: boolean)`, `definirConsorcios(usuarioId: string,
  consorcios: string[])` — todas retornam `Promise<{ ok: boolean; erro?: string }>`.

- [ ] **Step 1: Escrever `tests/consorcio-actions.test.ts` (falha)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    consorcio: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeGerirConsorcios: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeGerirConsorcios } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { criarConsorcio, renomearConsorcio, alternarConsorcioAtivo } from "@/app/(shell)/admin/consorcio-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const gerir = podeGerirConsorcios as ReturnType<typeof vi.fn>;
const findUnique = prisma.consorcio.findUnique as ReturnType<typeof vi.fn>;
const create = prisma.consorcio.create as ReturnType<typeof vi.fn>;
const update = prisma.consorcio.update as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("criarConsorcio", () => {
  it("bloqueia quem não é Super Admin", async () => {
    gerir.mockReturnValue(false);
    const r = await criarConsorcio("Consórcio X");
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejeita nome vazio", async () => {
    gerir.mockReturnValue(true);
    const r = await criarConsorcio("   ");
    expect(r).toEqual({ ok: false, erro: "Informe o nome do consórcio." });
  });

  it("rejeita nome duplicado", async () => {
    gerir.mockReturnValue(true);
    findUnique.mockResolvedValue({ id: "existente" });
    const r = await criarConsorcio("Consórcio X");
    expect(r).toEqual({ ok: false, erro: "Já existe um consórcio com esse nome." });
  });

  it("cria e registra auditoria", async () => {
    gerir.mockReturnValue(true);
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "novo-1" });
    const r = await criarConsorcio(" Consórcio X ");
    expect(r).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({ data: { nome: "Consórcio X" } });
    expect(registrar).toHaveBeenCalledWith("consorcio.criar", "Consorcio", "novo-1", "Consórcio X");
  });
});

describe("renomearConsorcio", () => {
  it("bloqueia quem não é Super Admin", async () => {
    gerir.mockReturnValue(false);
    const r = await renomearConsorcio("c1", "Novo nome");
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
  });

  it("renomeia e registra auditoria", async () => {
    gerir.mockReturnValue(true);
    const r = await renomearConsorcio("c1", " Novo nome ");
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nome: "Novo nome" } });
    expect(registrar).toHaveBeenCalledWith("consorcio.renomear", "Consorcio", "c1", "Novo nome");
  });
});

describe("alternarConsorcioAtivo", () => {
  it("bloqueia quem não é Super Admin", async () => {
    gerir.mockReturnValue(false);
    const r = await alternarConsorcioAtivo("c1", false);
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
  });

  it("ativa/desativa e registra auditoria", async () => {
    gerir.mockReturnValue(true);
    const r = await alternarConsorcioAtivo("c1", false);
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { ativo: false } });
    expect(registrar).toHaveBeenCalledWith("consorcio.ativo", "Consorcio", "c1", "desativado");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/consorcio-actions.test.ts`
Expected: FAIL — módulo `@/app/(shell)/admin/consorcio-actions` não existe.

- [ ] **Step 3: Implementar `app/(shell)/admin/consorcio-actions.ts`**

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { podeGerirConsorcios } from "@/lib/auth/usuario";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

export async function criarConsorcio(nome: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Informe o nome do consórcio." };
  const existe = await prisma.consorcio.findUnique({ where: { nome: n } });
  if (existe) return { ok: false, erro: "Já existe um consórcio com esse nome." };

  const c = await prisma.consorcio.create({ data: { nome: n } });
  await registrar("consorcio.criar", "Consorcio", c.id, n);
  revalidatePath("/admin");
  return { ok: true };
}

export async function renomearConsorcio(id: string, nome: string): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Nome inválido." };
  await prisma.consorcio.update({ where: { id }, data: { nome: n } });
  await registrar("consorcio.renomear", "Consorcio", id, n);
  revalidatePath("/admin");
  return { ok: true };
}

export async function alternarConsorcioAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  await prisma.consorcio.update({ where: { id }, data: { ativo } });
  await registrar("consorcio.ativo", "Consorcio", id, ativo ? "ativado" : "desativado");
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/consorcio-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de `definirConsorcios` (falha) em `tests/admin-actions.test.ts`**

Adicionar ao mock de `@/lib/prisma` no topo do arquivo o objeto `usuario.update` já existente
(reaproveitado) — nenhuma mudança de mock necessária, `definirConsorcios` usa o mesmo
`prisma.usuario.update`. Adicionar ao final do arquivo:

```ts
describe("definirConsorcios", () => {
  it("bloqueia quem não é Super Admin", async () => {
    usuarioAtual.mockResolvedValue(admin()); // perfil "admin", não "superadmin"
    gerirConsorcios.mockReturnValue(false);
    const r = await definirConsorcios("alvo-1", ["c1"]);
    expect(r).toEqual({ ok: false, erro: "Apenas Super Admin gerencia consórcios." });
    expect(update).not.toHaveBeenCalled();
  });

  it("define os consórcios e registra auditoria em caso de sucesso", async () => {
    usuarioAtual.mockResolvedValue(admin());
    gerirConsorcios.mockReturnValue(true);
    const r = await definirConsorcios("alvo-1", ["c1", "c2"]);
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: "alvo-1" },
      data: { consorcios: { set: [{ id: "c1" }, { id: "c2" }] } },
    });
    expect(registrar).toHaveBeenCalledWith("usuario.consorcios", "Usuario", "alvo-1", "2 consórcio(s)");
  });
});
```

Nota importante: diferente de `definirSetores`/`alternarAtivo`, esta ação usa `podeGerirConsorcios`
(Super Admin só), NÃO `podeAdministrar` — a spec (docs/superpowers/specs/2026-08-02-consorcios-design.md,
seção "Decisões confirmadas com o usuário") é explícita: "Gestão de consórcio (criar, renomear,
ativar/desativar, vincular usuários) é só Super Admin." Adicionar `podeGerirConsorcios` ao mock de
`@/lib/auth/usuario` no topo do arquivo de teste (junto de `getUsuarioAtual`/`podeAdministrar`/
`podeGerirAdmins`) e criar a constante `const gerirConsorcios = podeGerirConsorcios as
ReturnType<typeof vi.fn>;` junto das outras (`administrar`, `gerirAdmins`). Também adicionar
`definirConsorcios` e `podeGerirConsorcios` aos imports de `@/app/(shell)/admin/actions` e
`@/lib/auth/usuario` no topo do arquivo de teste.

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run tests/admin-actions.test.ts`
Expected: FAIL — `definirConsorcios` não exportada.

- [ ] **Step 7: Implementar `definirConsorcios` em `app/(shell)/admin/actions.ts`**

Adicionar logo abaixo de `definirSetores` (linha 99 do arquivo atual), e importar
`podeGerirConsorcios` junto de `podeAdministrar`/`podeGerirAdmins` no topo do arquivo. Nota:
diferente de `definirSetores`, esta ação usa `podeGerirConsorcios` (Super Admin só — mesma régua
do CRUD de consórcio da Task 4), NÃO `podeAdministrar` — gestão de consórcio inteira (CRUD +
vínculo de usuário) é exclusiva de Super Admin por decisão explícita do usuário (ver spec,
"Decisões confirmadas"), sem o conceito de "Gestor de Consórcio":

```ts
// Vincular consórcios (N:N). Só Super Admin — mesma régua do CRUD de consórcio
// (não existe "Gestor de Consórcio" nesta versão; diferente de definirSetores,
// que usa podeAdministrar porque Gestor de Setor pode gerir seu próprio setor).
export async function definirConsorcios(usuarioId: string, consorcios: string[]): Promise<ResultadoAcao> {
  const atual = await getUsuarioAtual();
  if (!podeGerirConsorcios(atual)) return { ok: false, erro: "Apenas Super Admin gerencia consórcios." };
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { consorcios: { set: consorcios.map((id) => ({ id })) } },
  });
  await registrar("usuario.consorcios", "Usuario", usuarioId, `${consorcios.length} consórcio(s)`);
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run tests/admin-actions.test.ts tests/consorcio-actions.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "app/(shell)/admin/consorcio-actions.ts" "app/(shell)/admin/actions.ts" tests/consorcio-actions.test.ts tests/admin-actions.test.ts
git commit -m "feat(admin): server actions de gestao de consorcio (CRUD + vinculo de usuario)"
```

---

### Task 5: Componente GerenciarConsorcios

**Files:**
- Create: `components/admin/GerenciarConsorcios.tsx`

**Interfaces:**
- Consumes: `criarConsorcio`, `renomearConsorcio`, `alternarConsorcioAtivo` (Task 4).
- Produces: `<GerenciarConsorcios consorcios={{id, nome, ativo}[]} />` (default export).

- [ ] **Step 1: Criar `components/admin/GerenciarConsorcios.tsx`, clone de `GerenciarSetores.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarConsorcio, renomearConsorcio, alternarConsorcioAtivo } from "@/app/(shell)/admin/consorcio-actions";
import { Button } from "@/components/ui/Button";

type Consorcio = { id: string; nome: string; ativo: boolean };

export default function GerenciarConsorcios({ consorcios }: { consorcios: Consorcio[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();

  function agir(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Falha.");
    });
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white shadow-card">
      <div className="border-b border-black/5 px-4 py-3">
        <span className="text-sm font-semibold text-black/80">Consórcios ({consorcios.length})</span>
      </div>
      <div className="px-4 py-3">
        <div className="mb-3 flex gap-2">
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo consórcio (ex.: Rodovia X)" className="h-10 flex-1 rounded border border-black/15 px-3 text-sm" />
          <Button onClick={() => { if (novo.trim()) { agir(() => criarConsorcio(novo)); setNovo(""); } }} disabled={pend}>
            + Adicionar
          </Button>
        </div>
        {erro && <p className="mb-2 text-xs text-red-600">{erro}</p>}
        <ul className="divide-y divide-black/5">
          {consorcios.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
              <input
                defaultValue={c.nome}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nome) agir(() => renomearConsorcio(c.id, v)); }}
                className="flex-1 rounded border border-transparent px-2 py-1 hover:border-black/10 focus:border-marsala"
              />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.ativo ? "bg-emerald-50 text-emerald-700" : "bg-black/10 text-black/50"}`}>
                {c.ativo ? "Ativo" : "Inativo"}
              </span>
              <button onClick={() => agir(() => alternarConsorcioAtivo(c.id, !c.ativo))} disabled={pend}
                className="rounded border border-black/15 px-2 py-1 text-[11px] text-black/70 hover:bg-black/5 disabled:opacity-60">
                {c.ativo ? "Desativar" : "Ativar"}
              </button>
            </li>
          ))}
          {consorcios.length === 0 && <li className="py-3 text-center text-xs text-black/40">Nenhum consórcio. Adicione o primeiro acima.</li>}
        </ul>
      </div>
    </section>
  );
}
```

Nota: `Button` de `@/components/ui/Button` só existe se a PR de padronização de botões
(`feat/padronizar-botoes-primarios`) já tiver sido mergeada em `main` antes desta feature ser
implementada. Se ainda não foi mergeada, usar o markup de botão cru equivalente ao de
`GerenciarSetores.tsx` (`className="h-10 rounded-md bg-marsala px-3 text-xs font-medium
text-white hover:bg-marsala-600 disabled:opacity-60"`) e trocar por `<Button>` depois, no mesmo
PR que fizer o merge/rebase.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/admin/GerenciarConsorcios.tsx
git commit -m "feat(admin): componente GerenciarConsorcios (CRUD de consorcio)"
```

---

### Task 6: LinhaUsuario ganha editor de vínculo de consórcio

**Files:**
- Modify: `components/admin/LinhaUsuario.tsx`

**Interfaces:**
- Consumes: `definirConsorcios` (Task 4).
- Produces: `LinhaUsuario` aceita nova prop `consorcios: { id: string; nome: string }[]` (lista
  de todos os consórcios ativos) e passa a esperar `usuario.consorcios: { id: string; nome:
  string }[]` no shape de `usuario`.

- [ ] **Step 1: Atualizar o tipo `U` e a prop do componente em `components/admin/LinhaUsuario.tsx`**

No tipo `U` (linha 9-18), adicionar:

```ts
type U = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  pendente: boolean;
  dataCadastro: string;
  setores: Setor[];
  consorcios: Setor[]; // mesmo shape {id, nome} — reaproveita o tipo Setor
};
```

Na assinatura do componente (linha 20-30), adicionar a prop `consorcios: Setor[]` (lista de
todos os consórcios ativos, análoga à prop `setores` que já existe).

- [ ] **Step 2: Importar `definirConsorcios` e adicionar estado de edição**

No topo, junto do import de `definirSetores`:

```ts
import { definirPerfil, definirSetores, definirConsorcios, alternarAtivo, removerUsuario } from "@/app/(shell)/admin/actions";
```

Logo abaixo de `const [sel, setSel] = useState<string[]>(usuario.setores.map((s) => s.id));`
(linha 35), adicionar o par equivalente para consórcio:

```ts
  const [editConsorcio, setEditConsorcio] = useState(false);
  const [selConsorcio, setSelConsorcio] = useState<string[]>(usuario.consorcios.map((c) => c.id));
```

Logo abaixo de `function salvarSetores() { ... }` (linha 73-76), adicionar:

```ts
  function toggleSelConsorcio(id: string) {
    setSelConsorcio((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function salvarConsorcios() {
    agir(() => definirConsorcios(usuario.id, selConsorcio));
    setEditConsorcio(false);
  }
```

- [ ] **Step 3: Renderizar o editor na célula da tabela**

A célula de Setores hoje (linhas 102-130) é auto-contida num `<td>`. Adicionar uma célula nova
logo em seguida, com a mesma estrutura (chips + botão "editar" quando fechado; checkboxes +
Salvar/cancelar quando aberto):

```tsx
      <td className="px-4 py-2">
        {!editConsorcio ? (
          <div className="flex flex-wrap items-center gap-1">
            {usuario.consorcios.length === 0 ? (
              <span className="text-xs text-black/30">—</span>
            ) : (
              usuario.consorcios.map((c) => (
                <span key={c.id} className="rounded-full bg-marsala-50 px-2 py-0.5 text-[10px] font-medium text-marsala">{c.nome}</span>
              ))
            )}
            <button onClick={() => { setSelConsorcio(usuario.consorcios.map((x) => x.id)); setEditConsorcio(true); }} className="ml-1 text-[11px] text-marsala hover:underline">editar</button>
          </div>
        ) : (
          <div className="w-56 rounded border border-black/15 p-2">
            <div className="mb-2 flex flex-wrap gap-1">
              {consorcios.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleSelConsorcio(c.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition ${selConsorcio.includes(c.id) ? "border-marsala bg-marsala text-white" : "border-black/15 text-black/60 hover:bg-black/5"}`}>
                  {c.nome}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={salvarConsorcios} disabled={pend}>Salvar</Button>
              <button onClick={() => setEditConsorcio(false)} className="text-[11px] text-black/50">cancelar</button>
            </div>
          </div>
        )}
      </td>
```

Nota: mesma observação do Task 5 sobre `@/components/ui/Button` — se ainda não existir, usar
markup cru equivalente.

Esta nova `<td>` precisa de um `<th>` correspondente no cabeçalho da tabela (arquivo
`app/(shell)/admin/page.tsx`, Task 7).

**Adendo (achado pelo reviewer, não previsto no draft original desta task):** gestão de consórcio
é só Super Admin (Global Constraints) — mas a `<td>` acima, como descrita, renderiza o botão
"editar" e o painel de checkboxes pra QUALQUER usuário com `podeAdministrar` (inclui Gestor de
Setor), que só seria barrado depois, ao clicar "Salvar" (o server action `definirConsorcios` já
rejeita corretamente — ver Task 4 — mas a UI não deveria nem oferecer o controle). O arquivo já
tem o padrão certo pra isso: a prop `podeAdmins: boolean` (linha ~25/31) gate a lista de cargos
privilegiados em `cargosDisponiveis` (linha ~48). Seguir o mesmo padrão: o componente ganha uma
nova prop `gerirConsorcios: boolean`; a lista de chips (somente leitura) continua sempre visível,
mas o botão "editar" e o painel de checkboxes só aparecem se `gerirConsorcios` for `true` —
senão, mostra só os chips, sem nenhum controle de edição:

```tsx
      <td className="px-4 py-2">
        {!editConsorcio ? (
          <div className="flex flex-wrap items-center gap-1">
            {usuario.consorcios.length === 0 ? (
              <span className="text-xs text-black/30">—</span>
            ) : (
              usuario.consorcios.map((c) => (
                <span key={c.id} className="rounded-full bg-marsala-50 px-2 py-0.5 text-[10px] font-medium text-marsala">{c.nome}</span>
              ))
            )}
            {gerirConsorcios && (
              <button onClick={() => { setSelConsorcio(usuario.consorcios.map((x) => x.id)); setEditConsorcio(true); }} className="ml-1 text-[11px] text-marsala hover:underline">editar</button>
            )}
          </div>
        ) : (
          // painel de checkboxes + Salvar/cancelar — igual ao já especificado acima
        )}
      </td>
```

(o bloco `else` do painel de checkboxes não muda — só é alcançável se `editConsorcio` for `true`,
que só acontece clicando "editar", que só existe quando `gerirConsorcios` é `true`; ainda assim,
se quiser máxima defesa em profundidade, pode envolver o bloco `else` inteiro em `{gerirConsorcios
&& editConsorcio ? (...) : ...}` — não obrigatório, o server já rejeita).

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: erro esperado neste ponto — `app/(shell)/admin/page.tsx` ainda não passa a prop
`consorcios` nem o campo `usuario.consorcios` — resolvido no Task 7.

- [ ] **Step 5: Commit (junto com o Task 7, já que um depende do outro para compilar)**

Deixar sem commit isolado — o commit deste task acontece no fim do Task 7.

---

### Task 7: Aba "Consórcios" em /admin

**Files:**
- Modify: `app/(shell)/admin/page.tsx`

**Interfaces:**
- Consumes: `GerenciarConsorcios` (Task 5), `LinhaUsuario` com prop `consorcios` (Task 6),
  `podeGerirConsorcios` (Task 2).

- [ ] **Step 1: Importar e buscar consórcios**

No topo, junto de `import GerenciarSetores from "@/components/admin/GerenciarSetores";`:

```ts
import GerenciarConsorcios from "@/components/admin/GerenciarConsorcios";
```

E no import de `@/lib/auth/usuario` (linha 3), adicionar `podeGerirConsorcios`:

```ts
import { getUsuarioAtual, podeAdministrar, podeGerirSetores, podeGerirConsorcios, podeGerirAdmins } from "@/lib/auth/usuario";
```

Logo abaixo de `const gerirSetores = podeGerirSetores(atual);` (linha 23):

```ts
  const gerirConsorcios = podeGerirConsorcios(atual);
```

- [ ] **Step 2: Ajustar o tipo `Params` e a resolução da aba ativa**

`tab` já é `string | undefined` — a linha 30 vira:

```ts
  const tab =
    searchParams.tab === "setores" && gerirSetores ? "setores" :
    searchParams.tab === "consorcios" && gerirConsorcios ? "consorcios" :
    "usuarios";
```

- [ ] **Step 3: Buscar os consórcios junto dos usuários/setores**

A query `Promise.all` (linhas 40-47) ganha uma terceira busca:

```ts
  const [usuarios, setores, consorcios] = await Promise.all([
    prisma.usuario.findMany({
      where: and.length ? { AND: and } : {},
      include: {
        setores: { select: { id: true, nome: true } },
        consorcios: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.area.findMany({ orderBy: { nome: "asc" } }),
    prisma.consorcio.findMany({ orderBy: { nome: "asc" } }),
  ]);
```

Logo abaixo de `const setoresAtivos = ...` (linha 49):

```ts
  const consorciosAtivos = consorcios.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
```

- [ ] **Step 4: Passar `consorcios` para `LinhaUsuario` e `ConvidarUsuarioForm` continua igual**

`ConvidarUsuarioForm` **não muda** (decisão de escopo — Global Constraints). Onde o arquivo
renderiza `<LinhaUsuario>` (dentro do `.map` da lista de usuários, mais abaixo no arquivo — não
mostrado no trecho já lido, mas segue o padrão `usuarios.map((u) => <LinhaUsuario usuario={...}
setores={setoresAtivos} .../>)`), adicionar as props `consorcios={consorciosAtivos}` e
`gerirConsorcios={gerirConsorcios}` (esta última é o que gate a UI do editor — ver adendo no
Task 6) e garantir que o objeto `usuario` passado inclua `consorcios: u.consorcios` (mesmo
formato de `setores: u.setores` que já é montado ali).

- [ ] **Step 5: Adicionar a aba e o painel**

Na barra de abas (linhas 69-81), logo depois do bloco `{gerirSetores && (...)}`:

```tsx
        {gerirConsorcios && (
          <Link href="/admin?tab=consorcios" className={abaClasse(tab === "consorcios")}>
            Consórcios ({consorcios.length})
          </Link>
        )}
```

E o bloco condicional de conteúdo (linha 83-84) vira uma cadeia de 3:

```tsx
      {tab === "setores" ? (
        <GerenciarSetores setores={setores.map((s) => ({ id: s.id, nome: s.nome, ativa: s.ativa }))} />
      ) : tab === "consorcios" ? (
        <GerenciarConsorcios consorcios={consorcios.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo }))} />
      ) : (
```

(mantendo o `<>...</>` da aba "usuarios" que já existe como último `else`).

- [ ] **Step 6: Adicionar o `<th>` de Consórcios na tabela de usuários**

Junto do cabeçalho da tabela de usuários (onde hoje tem `<th>Setor</th>` ou equivalente),
adicionar `<th>Consórcio</th>` logo depois, alinhado com a nova `<td>` do Task 6.

- [ ] **Step 7: Verificar tipos e rodar a suíte inteira**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros, todos os testes passam.

- [ ] **Step 8: Commit (Task 6 + Task 7 juntos)**

```bash
git add "app/(shell)/admin/page.tsx" components/admin/LinhaUsuario.tsx
git commit -m "feat(admin): aba Consorcios + vinculo de usuario na linha da tabela"
```

---

### Task 8: resolverAudiencia considera consórcio

Nota: a spec original (docs/superpowers/specs/2026-08-02-consorcios-design.md) previa uma
função pura `usuariosDoConsorcio` em `lib/politica/dominio.ts`. A exploração do código mostrou
que ela não seria pura (precisa ir ao banco buscar `Consorcio.membros`) e `dominio.ts` é 100%
livre de Prisma por design (ver comentário no topo do arquivo) — então a busca entra direto em
`estado-actions.ts`, no mesmo lugar que já resolve a audiência por setor/usuário, reaproveitando
o tipo `UsuarioAlvo` que já existe em `dominio.ts`.

**Files:**
- Modify: `app/(shell)/catalogo/[id]/estado-actions.ts`
- Test: `tests/estado-actions.test.ts`

**Interfaces:**
- Consumes: `UsuarioAlvo` (já existe em `lib/politica/dominio.ts`).
- Produces: `resolverAudiencia` (função interna, não exportada) passa a checar
  `politica.consorcioId` antes de cair na lógica de audiência por setor/usuário.

- [ ] **Step 1: Atualizar o mock de `politica.findUnique` nos testes existentes**

Em `tests/estado-actions.test.ts`, o objeto mockado de política (por volta da linha 71-72,
`audienciaSetores: []`/`audienciaUsuarios: []`) ganha o campo `consorcioId: null` — sem isso o
teste continua passando (comportamento de "AAHBRANT/todos" preservado), mas deixa o mock fiel ao
novo schema.

- [ ] **Step 2: Escrever o teste novo (falha) em `tests/estado-actions.test.ts`**

Dentro de `describe("publicarPolitica — geração do documento oficial", ...)`, adicionar:

```ts
it("politica com consorcioId: notifica só os membros do consórcio, ignora audienciaSetores/Usuarios", async () => {
  // reaproveita o setup do describe (mock de getUsuarioAtual, gerarDocumentoOficial, etc. —
  // ver o topo do describe existente para os mocks compartilhados)
  findUnique
    .mockResolvedValueOnce({
      ...politicaBase, // helper já usado nos outros testes deste describe
      consorcioId: "c1",
      audienciaSetores: [{ id: "s1", membros: [{ id: "u-fora", oid: "o-fora", nome: "Fora", email: "fora@x.com", ativo: true }] }],
      audienciaUsuarios: [],
    })
    .mockResolvedValueOnce(null); // 2ª chamada é a de resolverAudiencia — ver Step 3

  // membros do consórcio: só quem está em Consorcio.membros
  prisma.consorcio.findUnique = vi.fn().mockResolvedValue({
    membros: [{ id: "u-consorcio", oid: "o-consorcio", nome: "Do Consórcio", email: "consorcio@x.com", ativo: true }],
  });

  await publicarPolitica("pol-1");

  expect(prisma.notificacao.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ usuarioEmail: "consorcio@x.com" }) }),
  );
  expect(prisma.notificacao.create).not.toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ usuarioEmail: "fora@x.com" }) }),
  );
});
```

Adaptar o mock de `prisma.consorcio.findUnique` para o formato exato de mock já usado no
arquivo (ver como `prisma.politica.findUnique`/`prisma.usuario.findMany` são mockados no topo
do describe existente — provavelmente via `vi.mock("@/lib/prisma", ...)` no topo do arquivo;
adicionar `consorcio: { findUnique: vi.fn() }` a esse mock).

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: FAIL — `usuarioEmail: "fora@x.com"` foi chamado (resolverAudiencia ainda ignora
`consorcioId`).

- [ ] **Step 4: Implementar em `app/(shell)/catalogo/[id]/estado-actions.ts`**

Substituir a função `resolverAudiencia` (linhas 35-54) por:

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

  // Consórcio como destino substitui o público-alvo por setor/usuário — ver
  // spec docs/superpowers/specs/2026-08-02-consorcios-design.md.
  if (politica.consorcioId) {
    const consorcio = await prisma.consorcio.findUnique({
      where: { id: politica.consorcioId },
      include: { membros: { where: { ativo: true } } },
    });
    return (consorcio?.membros ?? []).map(paraAlvo);
  }

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

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(shell)/catalogo/[id]/estado-actions.ts" tests/estado-actions.test.ts
git commit -m "feat(publicacao): notificacao de consorcio usa membros do consorcio, nao publico-alvo"
```

---

### Task 9: Seletor de destino na criação da política

**Files:**
- Modify: `components/politica/NovaPoliticaForm.tsx`
- Modify: `app/(shell)/catalogo/actions.ts`
- Modify: `app/(shell)/catalogo/page.tsx`
- Modify: `app/(shell)/tipos/[tipo]/page.tsx`
- Test: `tests/catalogo-actions.test.ts` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores além do schema (Task 1).
- Produces: `NovaPoliticaForm` aceita nova prop `consorcios: { id: string; nome: string }[]`;
  `criarPolitica` persiste `consorcioId` (nulo se vazio).

- [ ] **Step 1: Escrever `tests/catalogo-actions.test.ts` (falha) — só o caso novo, os demais já
  são cobertos manualmente hoje (não havia suíte prévia para este arquivo)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    area: { upsert: vi.fn() },
    politica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeCriarPolitica: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));
vi.mock("@/lib/politica/codigo", () => ({ gerarCodigoNormativo: vi.fn().mockResolvedValue("AHBT-POL-TI-001") }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { criarPolitica } from "@/app/(shell)/catalogo/actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const podeCriar = podeCriarPolitica as ReturnType<typeof vi.fn>;
const upsert = prisma.area.upsert as ReturnType<typeof vi.fn>;
const create = prisma.politica.create as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

function formData(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("criarPolitica — consorcioId", () => {
  it("sem consorcio no form: consorcioId fica undefined (AAHBRANT/todos)", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
    create.mockResolvedValue({ id: "pol-1" });

    await criarPolitica(formData({ titulo: "Norma X", area: "TI", classificacao: "publico_interno" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consorcioId: undefined }) }),
    );
  });

  it("com consorcio selecionado: persiste consorcioId", async () => {
    usuarioAtual.mockResolvedValue({ id: "u1" });
    podeCriar.mockReturnValue(true);
    upsert.mockResolvedValue({ id: "area-1", nome: "TI" });
    create.mockResolvedValue({ id: "pol-1" });

    await criarPolitica(formData({ titulo: "Norma X", area: "TI", classificacao: "publico_interno", consorcioId: "c1" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consorcioId: "c1" }) }),
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/catalogo-actions.test.ts`
Expected: FAIL — `consorcioId` não está presente no `data` passado a `prisma.politica.create`.

- [ ] **Step 3: Implementar em `app/(shell)/catalogo/actions.ts`**

Logo abaixo de `const classificacao = String(formData.get("classificacao") ?? "").trim();`
(linha 23):

```ts
  const consorcioIdBruto = String(formData.get("consorcioId") ?? "").trim();
  const consorcioId = consorcioIdBruto || undefined;
```

No objeto `data` do `prisma.politica.create` (linha 51-67), adicionar `consorcioId,` logo
depois de `areaId: areaRegistro.id,`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/catalogo-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicionar o `<select>` de destino em `components/politica/NovaPoliticaForm.tsx`**

Nova prop na assinatura do componente (linha 10):

```tsx
export default function NovaPoliticaForm({
  tipo = "politica",
  consorcios = [],
}: {
  tipo?: TipoDocumentoValor;
  consorcios?: { id: string; nome: string }[];
}) {
```

Dentro do `<form>`, logo depois do bloco de "Classificação" (linhas 81-94, fecha com
`</label>`), adicionar um novo campo (fora do `grid` de 3 colunas, ocupando linha própria, já
que só aparece quando há consórcios cadastrados):

```tsx
      {consorcios.length > 0 && (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-black/60">Destino</span>
          <select
            name="consorcioId"
            defaultValue=""
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-marsala sm:w-1/3"
          >
            <option value="">AAHBRANT (todos)</option>
            {consorcios.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
      )}
```

- [ ] **Step 6: Passar a prop `consorcios` nos 2 call sites**

Em `app/(shell)/catalogo/page.tsx`, buscar os consórcios ativos e passar ao form:

```ts
import { prisma } from "@/lib/prisma";
// ...
  const consorciosAtivos = await prisma.consorcio.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
```

E `{podeCriar && <NovaPoliticaForm tipo="politica" consorcios={consorciosAtivos} />}`.

Em `app/(shell)/tipos/[tipo]/page.tsx`, o mesmo padrão:

```ts
import { prisma } from "@/lib/prisma";
// ...
  const consorciosAtivos = await prisma.consorcio.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
```

E `{podeCriar && <NovaPoliticaForm tipo={info.valor} consorcios={consorciosAtivos} />}`.

- [ ] **Step 7: Verificar tipos e rodar a suíte inteira**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros, todos os testes passam.

- [ ] **Step 8: Commit**

```bash
git add components/politica/NovaPoliticaForm.tsx "app/(shell)/catalogo/actions.ts" "app/(shell)/catalogo/page.tsx" "app/(shell)/tipos/[tipo]/page.tsx" tests/catalogo-actions.test.ts
git commit -m "feat(criacao): seletor de destino (AAHBRANT ou consorcio) na criacao do documento"
```

---

### Task 10: Tela de detalhe mostra o destino, esconde AudienciaSelector quando há consórcio

**Files:**
- Modify: `app/(shell)/catalogo/[id]/page.tsx`

**Interfaces:**
- Consumes: `politica.consorcioId`/`politica.consorcio` (Task 1).

- [ ] **Step 1: Incluir `consorcio` na query Prisma**

No `include` de `prisma.politica.findFirst` (linhas 38-46), adicionar `consorcio: true,` logo
depois de `area: true,`.

- [ ] **Step 2: Mostrar o destino ao lado de "Área: ..."**

Logo depois de `<p className="mt-1 text-sm text-black/50">Área: {politica.area.nome}</p>`
(linha 98):

```tsx
        <p className="mt-1 text-sm text-black/50">
          Destino: {politica.consorcio ? politica.consorcio.nome : "AAHBRANT (todos)"}
        </p>
```

- [ ] **Step 3: Esconder o `AudienciaSelector` quando há consórcio**

A condição da seção (linha 201) muda de:

```tsx
      {podeEditar && politica.estado === "rascunho" && (
```

para:

```tsx
      {podeEditar && politica.estado === "rascunho" && !politica.consorcioId && (
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/(shell)/catalogo/[id]/page.tsx"
git commit -m "feat(detalhe): mostra destino do documento, esconde publico-alvo quando ha consorcio"
```

---

### Task 11: Verificação final + PR

**Files:** nenhum (só verificação e abertura de PR).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx vitest run`
Expected: tudo limpo, todos os testes passam.

- [ ] **Step 2: Verificação manual no navegador**

Como Super Admin: criar um consórcio em `/admin?tab=consorcios`; vincular 1 usuário de teste a
ele em Usuários → editar consórcio; criar uma política destinada a esse consórcio; publicar;
logar (ou trocar perfil dev) como um colaborador FORA do consórcio e confirmar que a política
não aparece no catálogo/busca/painel; confirmar que o usuário vinculado ao consórcio vê
normalmente.

- [ ] **Step 3: Criar branch, commitar squash-friendly (os commits já são incrementais dos
  tasks anteriores), push e abrir PR no Azure DevOps**

```bash
git push -u origin feat/consorcios
az repos pr create --repository g-politicas --source-branch feat/consorcios --target-branch main \
  --title "feat: consorcios (destino de documento alem de AAHBRANT)" \
  --description "Ver docs/superpowers/specs/2026-08-02-consorcios-design.md para o design completo." \
  --open
```

- [ ] **Step 4: Aguardar aprovação + build da policy antes de completar o merge (fluxo já
  estabelecido no repositório).**
