# Reconciliação de Pendência ao Convidar Usuário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um usuário é convidado (`convidarUsuario`), ele ganha automaticamente `Pendencia` de ciência para toda política publicada (sem consórcio) que já se aplicava a ele — audiência aberta a todos, ou audiência restrita a algum dos setores do convite.

**Architecture:** Uma função pura nova (`politicasParaNovoUsuario`) decide quais políticas publicadas valem pro novo usuário; `convidarUsuario` chama essa função logo após criar o registro e cria as `Pendencia` faltantes via `createMany` + `skipDuplicates`, best-effort (nunca falha o convite).

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, Vitest.

## Global Constraints

- Best-effort: falha na reconciliação NUNCA desfaz nem impede o convite já commitado (mesma filosofia de `criarPendencias`/`notificarAudiencia` em `app/(shell)/catalogo/[id]/estado-actions.ts`).
- Só o gatilho "criar/convidar usuário". Reativação, vínculo de setor pós-criação e vínculo de consórcio ficam fora de escopo — nenhuma mudança em `resolverAudiencia`/`criarPendencias` do fluxo de publish.
- Políticas com `consorcioId` preenchido nunca entram na reconciliação (convite não atribui consórcio, então nunca valem pro usuário novo).
- Sem job assíncrono — roda inline dentro da própria server action.

---

### Task 1: Função pura `politicasParaNovoUsuario`

**Files:**
- Modify: `lib/politica/pendencia.ts`
- Test: `tests/pendencia.test.ts`

**Interfaces:**
- Produces: `PoliticaAlvoReconciliacao` (type: `{ id: string; tipo: string; publicadaEm: Date; setorIds: string[] }`) e `politicasParaNovoUsuario(politicas: PoliticaAlvoReconciliacao[], setorIdsUsuario: string[]): PoliticaAlvoReconciliacao[]` — usados pela Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `tests/pendencia.test.ts` (mantendo o `import { dadosPendencia } from "@/lib/politica/pendencia";` já existente e adicionando `politicasParaNovoUsuario` a ele):

```ts
import { describe, it, expect } from "vitest";
import { dadosPendencia, politicasParaNovoUsuario } from "@/lib/politica/pendencia";

// ... (describe("dadosPendencia", ...) existente continua igual, sem mudança)

describe("politicasParaNovoUsuario", () => {
  const politicaAberta = { id: "p-aberta", tipo: "politica", publicadaEm: new Date("2026-08-01"), setorIds: [] };
  const politicaSetorTI = { id: "p-ti", tipo: "norma", publicadaEm: new Date("2026-08-02"), setorIds: ["setor-ti"] };
  const politicaSetorRH = { id: "p-rh", tipo: "manual", publicadaEm: new Date("2026-08-03"), setorIds: ["setor-rh"] };

  it("inclui política de audiência aberta (setorIds vazio) mesmo se o usuário não tem setor", () => {
    const r = politicasParaNovoUsuario([politicaAberta], []);
    expect(r).toEqual([politicaAberta]);
  });

  it("inclui política restrita a setor quando o usuário está nesse setor", () => {
    const r = politicasParaNovoUsuario([politicaSetorTI], ["setor-ti"]);
    expect(r).toEqual([politicaSetorTI]);
  });

  it("exclui política restrita a setor quando o usuário não está em nenhum dos setores dela", () => {
    const r = politicasParaNovoUsuario([politicaSetorTI], ["setor-rh"]);
    expect(r).toEqual([]);
  });

  it("usuário sem nenhum setor não entra em política restrita a setor", () => {
    const r = politicasParaNovoUsuario([politicaSetorTI], []);
    expect(r).toEqual([]);
  });

  it("filtra corretamente numa lista mista", () => {
    const r = politicasParaNovoUsuario([politicaAberta, politicaSetorTI, politicaSetorRH], ["setor-ti"]);
    expect(r).toEqual([politicaAberta, politicaSetorTI]);
  });

  it("lista de políticas vazia retorna lista vazia", () => {
    expect(politicasParaNovoUsuario([], ["setor-ti"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/pendencia.test.ts`
Expected: FAIL — `politicasParaNovoUsuario` não está exportado por `@/lib/politica/pendencia`.

- [ ] **Step 3: Implementar a função**

Adicione ao final de `lib/politica/pendencia.ts` (mantendo `dadosPendencia` e o `DadoPendencia` type existentes intactos):

```ts
export type PoliticaAlvoReconciliacao = {
  id: string;
  tipo: string;
  publicadaEm: Date;
  setorIds: string[]; // ids de audienciaSetores desta política
};

// Filtra, entre políticas publicadas SEM consórcio, quais valem pro usuário
// recém-criado: audiência vazia (aberta a todos) OU algum setor do convite
// bate com audienciaSetores da política. Espelha audienciaVazia/unirAudiencia
// (lib/politica/dominio.ts), só que na direção inversa (usuário → políticas,
// não política → usuários) — usada por convidarUsuario em
// app/(shell)/admin/actions.ts pra criar a Pendencia retroativa que falta
// quando o convite acontece depois da política já publicada.
export function politicasParaNovoUsuario(
  politicas: PoliticaAlvoReconciliacao[],
  setorIdsUsuario: string[],
): PoliticaAlvoReconciliacao[] {
  return politicas.filter(
    (p) => p.setorIds.length === 0 || p.setorIds.some((id) => setorIdsUsuario.includes(id)),
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/pendencia.test.ts`
Expected: PASS (8 testes: 2 de `dadosPendencia` + 6 de `politicasParaNovoUsuario`)

- [ ] **Step 5: Commit**

```bash
git add lib/politica/pendencia.ts tests/pendencia.test.ts
git commit -m "feat: politicasParaNovoUsuario filtra políticas publicadas relevantes pra usuário novo"
```

---

### Task 2: Reconciliação inline em `convidarUsuario`

**Files:**
- Modify: `app/(shell)/admin/actions.ts:1-61`
- Test: `tests/admin-actions.test.ts`

**Interfaces:**
- Consumes: `politicasParaNovoUsuario` e `PoliticaAlvoReconciliacao` (Task 1, `@/lib/politica/pendencia`); `dadosPendencia` (já existe em `@/lib/politica/pendencia`).

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/admin-actions.test.ts`, atualize o bloco `vi.mock("@/lib/prisma", ...)` (linhas 7-16) pra incluir `politica` e `pendencia`:

```ts
vi.mock("@/lib/prisma", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    politica: { findMany: vi.fn() },
    pendencia: { createMany: vi.fn() },
  },
}));
```

Adicione os dois consts extraídos, junto dos outros (`findUnique`, `create`, etc., logo após a linha 48):

```ts
const politicaFindMany = prisma.politica.findMany as ReturnType<typeof vi.fn>;
const pendenciaCreateMany = prisma.pendencia.createMany as ReturnType<typeof vi.fn>;
```

No teste existente `"cria o usuário, registra auditoria e revalida a página em caso de sucesso"` (linha 116), adicione uma linha logo após `create.mockResolvedValue({ id: "novo-1" });`, pra manter esse teste isolado da reconciliação (sem política publicada, nada acontece):

```ts
it("cria o usuário, registra auditoria e revalida a página em caso de sucesso", async () => {
  usuarioAtual.mockResolvedValue(admin());
  findUnique.mockResolvedValue(null);
  create.mockResolvedValue({ id: "novo-1" });
  politicaFindMany.mockResolvedValue([]);

  const r = await convidarUsuario(" Fulano ", " Fulano@Empresa.com ", "colaborador", ["setor-1"]);
  // ... resto do teste sem mudança
```

Adicione um novo `describe`, logo depois do `describe("convidarUsuario", ...)` existente (antes de `describe("definirPerfil", ...)`):

```ts
describe("convidarUsuario — reconciliação de pendência", () => {
  beforeEach(() => {
    usuarioAtual.mockResolvedValue(admin());
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "novo-1", oid: null, nome: "Fulano", email: "fulano@empresa.com" });
  });

  it("cria Pendencia pra política publicada de audiência aberta", async () => {
    politicaFindMany.mockResolvedValue([
      { id: "pol-1", tipo: "politica", publicadaEm: new Date("2026-08-01"), audienciaSetores: [] },
    ]);
    pendenciaCreateMany.mockResolvedValue({ count: 1 });

    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", []);

    expect(r).toEqual({ ok: true });
    expect(politicaFindMany).toHaveBeenCalledWith({
      where: { estado: "publicada", consorcioId: null },
      include: { audienciaSetores: { select: { id: true } } },
    });
    expect(pendenciaCreateMany).toHaveBeenCalledWith({
      data: [
        {
          politicaId: "pol-1",
          usuarioId: "novo-1",
          politicaPublicadaEm: new Date("2026-08-01"),
          tipo: "politica",
          estado: "pendente",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("cria Pendencia pra política restrita ao setor do convite", async () => {
    politicaFindMany.mockResolvedValue([
      { id: "pol-2", tipo: "norma", publicadaEm: new Date("2026-08-02"), audienciaSetores: [{ id: "setor-ti" }] },
    ]);
    pendenciaCreateMany.mockResolvedValue({ count: 1 });

    await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", ["setor-ti"]);

    expect(pendenciaCreateMany).toHaveBeenCalledTimes(1);
  });

  it("NÃO cria Pendencia pra política restrita a outro setor", async () => {
    politicaFindMany.mockResolvedValue([
      { id: "pol-3", tipo: "manual", publicadaEm: new Date("2026-08-03"), audienciaSetores: [{ id: "setor-rh" }] },
    ]);

    await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", ["setor-ti"]);

    expect(pendenciaCreateMany).not.toHaveBeenCalled();
  });

  it("sem política publicada nenhuma, não chama createMany e ainda retorna ok", async () => {
    politicaFindMany.mockResolvedValue([]);

    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", []);

    expect(r).toEqual({ ok: true });
    expect(pendenciaCreateMany).not.toHaveBeenCalled();
  });

  it("falha ao buscar políticas não impede o convite (best-effort)", async () => {
    politicaFindMany.mockRejectedValue(new Error("db fora do ar"));

    const r = await convidarUsuario("Fulano", "fulano@empresa.com", "colaborador", []);

    expect(r).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/admin-actions.test.ts`
Expected: FAIL — `prisma.politica.findMany` não é chamado (reconciliação ainda não existe em `convidarUsuario`), então `politicaFindMany`/`pendenciaCreateMany` nunca recebem os argumentos esperados.

- [ ] **Step 3: Implementar a reconciliação**

Em `app/(shell)/admin/actions.ts`, adicione aos imports do topo (logo após a linha 7, `import { CARGOS_PRIVILEGIADOS } from "@/lib/auth/perfis";`):

```ts
import type { Prisma } from "@prisma/client";
import { dadosPendencia, politicasParaNovoUsuario, type PoliticaAlvoReconciliacao } from "@/lib/politica/pendencia";
```

Substitua o corpo de `convidarUsuario` (linhas 48-61) por:

```ts
  const criado = await prisma.usuario.create({
    data: {
      email: emailT,
      nome: nomeT,
      perfil: perfil as never,
      ativo: true,
      convidadoPor: atual.email,
      setores: setores.length ? { connect: setores.map((id) => ({ id })) } : undefined,
    },
  });

  // Best-effort (mesma filosofia de criarPendencias/notificarAudiencia em
  // estado-actions.ts): o convite já está commitado acima — falha aqui nunca
  // pode desfazê-lo ou impedi-lo. Cria a Pendencia retroativa que faltaria se
  // o novo usuário só passasse a contar na PRÓXIMA publicação.
  try {
    const publicadas = await prisma.politica.findMany({
      where: { estado: "publicada", consorcioId: null },
      include: { audienciaSetores: { select: { id: true } } },
    });
    const alvo: PoliticaAlvoReconciliacao[] = publicadas
      .filter((p) => p.publicadaEm)
      .map((p) => ({
        id: p.id,
        tipo: p.tipo,
        publicadaEm: p.publicadaEm as Date,
        setorIds: p.audienciaSetores.map((s) => s.id),
      }));
    const relevantes = politicasParaNovoUsuario(alvo, setores);
    for (const p of relevantes) {
      await prisma.pendencia.createMany({
        data: dadosPendencia(p.id, p.tipo, p.publicadaEm, [
          { id: criado.id, oid: criado.oid, nome: criado.nome, email: criado.email },
        ]) as Prisma.PendenciaCreateManyInput[],
        skipDuplicates: true,
      });
    }
  } catch (erro) {
    console.error("Falha ao reconciliar pendencias do novo usuário (convite já confirmado):", erro);
  }

  await registrar("usuario.convidar", "Usuario", criado.id, `${emailT} como ${perfil}`);
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/admin-actions.test.ts`
Expected: PASS (todos os testes de `convidarUsuario` existentes + os 5 novos de reconciliação)

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS — nenhum teste de outro arquivo quebrou (nenhum outro arquivo mocka `prisma.politica`/`prisma.pendencia` de um jeito que colida com essa mudança, já que cada teste usa seu próprio `vi.mock` isolado por arquivo).

- [ ] **Step 6: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos (o cast `as Prisma.PendenciaCreateManyInput[]` segue o mesmo padrão já usado em `criarPendencias`, `app/(shell)/catalogo/[id]/estado-actions.ts:127`).

- [ ] **Step 7: Commit**

```bash
git add app/\(shell\)/admin/actions.ts tests/admin-actions.test.ts
git commit -m "feat: convidarUsuario cria Pendencia retroativa pra políticas já publicadas (best-effort)"
```

---

### Task 3: Verificação final

**Files:** nenhum arquivo novo — só validação.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS, todos os testes (incluindo os das Tasks 1 e 2).

- [ ] **Step 2: Rodar lint**

Run: `npx eslint . --max-warnings=0`
Expected: sem erros/warnings novos.

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Conferir manualmente o escopo fora desta feature**

Confirme que `app/(shell)/catalogo/[id]/estado-actions.ts` (resolverAudiencia, criarPendencias, publicarPolitica) não foi tocado — `git diff main -- 'app/(shell)/catalogo/[id]/estado-actions.ts'` deve vir vazio.

- [ ] **Step 5: Commit final (se sobrou algo solto)**

Se as Tasks 1 e 2 já commitaram tudo, não há o que commitar aqui — só confirme com `git status --short` que a working tree só mostra o `app/api/documentos/[id]/route.ts` de outra sessão (não mexer nele) e nada mais pendente deste plano.
