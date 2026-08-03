# Lembretes automáticos de ciência pendente (Fase D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lembrar automaticamente o colaborador com pendência de ciência há 3, 7 e 15 dias (Teams + destaque visual), e avisar o SGI/Qualidade em resumo diário quando alguém passa de 15 dias.

**Architecture:** Uma rota de API protegida por secret (`POST /api/cron/lembretes-pendencia`) concentra toda a lógica (varredura, decisão de marco, envio Teams, gravação de idempotência, resumo SGI) — ela roda dentro do app Next.js normal, então tem acesso a Prisma e ao módulo Graph já existentes sem nenhuma infraestrutura nova de execução. Um Azure Container Apps Job agendado (cron diário) só dispara essa rota via HTTP, usando um script JS puro (sem TypeScript) copiado explicitamente no Dockerfile — o output standalone do Next não inclui `scripts/` nem TS, então não dá pra rodar um script solto "na mesma imagem" sem isso.

**Tech Stack:** Next.js 14 App Router (Route Handler), Prisma/PostgreSQL, Microsoft Graph API (`sendActivityNotification`, já integrado via `lib/notificacao/graph.ts` e `@azure/msal-node`), Azure Container Apps Jobs (Bicep), Vitest.

## Global Constraints

- Nunca usar `new Date()` dentro de função pura — sempre receber `agora` como parâmetro (regra já seguida em `dadosPendencia`/`acaoVersao`).
- Todo envio Teams é best-effort: falha em 1 usuário nunca aborta o lote (mesma filosofia da criação de `Pendencia` na Fase A).
- Migration sempre aditiva (campos `DateTime?`) — nunca quebra dado existente.
- Idempotência por marco: campo `lembreteXEnviadoEm` só é gravado depois do envio Teams confirmar sucesso.
- Repo usa Azure DevOps para PR (`az repos pr create`), não GitHub.
- Spec de referência: `docs/superpowers/specs/2026-08-02-lembretes-pendencia-ciencia-fase-d-design.md` (já corrigida — permissão Graph já concedida, mecanismo de execução via rota protegida + trigger JS, não script solto).

---

### Task 1: Migration — Pendencia ganha campos de idempotência de lembrete

**Files:**
- Modify: `prisma/schema.prisma` (model `Pendencia`, perto de `notificadaEm`)
- Create: migration via `npx prisma migrate dev` (pasta gerada automaticamente em `prisma/migrations/`)

**Interfaces:**
- Produces: `Pendencia.lembrete3EnviadoEm`, `Pendencia.lembrete7EnviadoEm`, `Pendencia.lembrete15EnviadoEm` — todos `DateTime?`, usados pela Task 2 (função pura) e Task 6 (rota de API).

- [ ] **Step 1: Adicionar os 3 campos ao model `Pendencia`**

Em `prisma/schema.prisma`, dentro do `model Pendencia { ... }`, logo após a linha `notificadaEm DateTime? // null = toast da Fase B ainda não mostrado`:

```prisma
  lembrete3EnviadoEm  DateTime? // null = marco de 3 dias ainda não enviado
  lembrete7EnviadoEm  DateTime? // null = marco de 7 dias ainda não enviado
  lembrete15EnviadoEm DateTime? // null = marco de 15 dias ainda não enviado
```

- [ ] **Step 2: Gerar e aplicar a migration**

Run: `npx prisma migrate dev --name pendencia_lembretes`
Expected: cria pasta nova em `prisma/migrations/<timestamp>_pendencia_lembretes/migration.sql` com 3 `ALTER TABLE ... ADD COLUMN` e aplica no banco de dev local sem erro.

- [ ] **Step 3: Confirmar que o client gerado tem os campos novos**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: 0 erros (o `tsc` já pegaria referência a campo inexistente se a geração falhasse).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(pendencia): campos de idempotencia de lembrete (3/7/15 dias)"
```

---

### Task 2: Função pura `lembretesPendentes` + destaque de urgência por idade

**Files:**
- Create: `lib/politica/lembretesPendentes.ts`
- Test: `tests/lembretesPendentes.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependência de outras tasks).
- Produces:
  - `type MarcoLembrete = 3 | 7 | 15`
  - `function lembretesPendentes(pendencia: { criadaEm: Date; lembrete3EnviadoEm: Date | null; lembrete7EnviadoEm: Date | null; lembrete15EnviadoEm: Date | null }, agora: Date): MarcoLembrete[]` — usada pela Task 6.
  - `type NivelUrgenciaPendencia = "normal" | "atencao" | "alerta" | "critico"`
  - `function nivelUrgenciaPendencia(criadaEm: Date, agora: Date): NivelUrgenciaPendencia` — usada pelas Tasks 4 e 5.
  - `function classesUrgenciaPendencia(nivel: NivelUrgenciaPendencia): string` — usada pelas Tasks 4 e 5.

- [ ] **Step 1: Escrever os testes de `lembretesPendentes`**

```ts
// tests/lembretesPendentes.test.ts
import { describe, it, expect } from "vitest";
import {
  lembretesPendentes,
  nivelUrgenciaPendencia,
  classesUrgenciaPendencia,
} from "@/lib/politica/lembretesPendentes";

function pendenciaBase(overrides: Partial<{
  criadaEm: Date;
  lembrete3EnviadoEm: Date | null;
  lembrete7EnviadoEm: Date | null;
  lembrete15EnviadoEm: Date | null;
}> = {}) {
  return {
    criadaEm: new Date("2026-01-01T00:00:00Z"),
    lembrete3EnviadoEm: null,
    lembrete7EnviadoEm: null,
    lembrete15EnviadoEm: null,
    ...overrides,
  };
}

describe("lembretesPendentes", () => {
  it("0 dias: nenhum marco", () => {
    const agora = new Date("2026-01-01T05:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([]);
  });

  it("exatos 3 dias: dispara marco 3", () => {
    const agora = new Date("2026-01-04T00:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([3]);
  });

  it("exatos 7 dias: dispara marco 7 (3 já não entra, pois não foi passado no teste como pendente de novo)", () => {
    const agora = new Date("2026-01-08T00:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([3, 7]);
  });

  it("exatos 15 dias: dispara os 3 marcos juntos (job nunca rodou antes)", () => {
    const agora = new Date("2026-01-16T00:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([3, 7, 15]);
  });

  it("marco já enviado não repete", () => {
    const agora = new Date("2026-01-16T00:00:00Z");
    const pendencia = pendenciaBase({
      lembrete3EnviadoEm: new Date("2026-01-04T00:00:00Z"),
      lembrete7EnviadoEm: new Date("2026-01-08T00:00:00Z"),
    });
    expect(lembretesPendentes(pendencia, agora)).toEqual([15]);
  });

  it("todos os marcos já enviados: nenhum novo", () => {
    const agora = new Date("2026-01-20T00:00:00Z");
    const pendencia = pendenciaBase({
      lembrete3EnviadoEm: new Date("2026-01-04T00:00:00Z"),
      lembrete7EnviadoEm: new Date("2026-01-08T00:00:00Z"),
      lembrete15EnviadoEm: new Date("2026-01-16T00:00:00Z"),
    });
    expect(lembretesPendentes(pendencia, agora)).toEqual([]);
  });

  it("2 dias e 23 horas: ainda não vira 3 dias (arredonda pra baixo)", () => {
    const agora = new Date("2026-01-03T23:00:00Z");
    expect(lembretesPendentes(pendenciaBase(), agora)).toEqual([]);
  });
});

describe("nivelUrgenciaPendencia", () => {
  it("0-2 dias: normal", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-02T00:00:00Z"))).toBe("normal");
  });

  it("3-6 dias: atencao", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-04T00:00:00Z"))).toBe("atencao");
  });

  it("7-14 dias: alerta", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-08T00:00:00Z"))).toBe("alerta");
  });

  it("15+ dias: critico", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    expect(nivelUrgenciaPendencia(criadaEm, new Date("2026-01-16T00:00:00Z"))).toBe("critico");
  });
});

describe("classesUrgenciaPendencia", () => {
  it("normal não adiciona destaque", () => {
    expect(classesUrgenciaPendencia("normal")).toBe("");
  });

  it("critico usa vermelho", () => {
    expect(classesUrgenciaPendencia("critico")).toContain("red");
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/lembretesPendentes.test.ts`
Expected: FAIL — `Cannot find module '@/lib/politica/lembretesPendentes'`.

- [ ] **Step 3: Implementar `lib/politica/lembretesPendentes.ts`**

```ts
// Regras puras de "há quanto tempo essa Pendencia está parada": decide quais
// marcos de lembrete (3/7/15 dias) disparar e qual destaque visual usar onde
// a pendência já aparece hoje (home, sino). Sem I/O — sempre recebe `agora`
// como parâmetro, nunca lê o relógio internamente (mesmo padrão de
// dadosPendencia/acaoVersao).

export type MarcoLembrete = 3 | 7 | 15;

function diasCorridos(inicio: Date, agora: Date): number {
  return Math.floor((agora.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
}

// Cobre o caso do job ter ficado parado (ex.: agente de CI/infra offline) e
// rodar atrasado: dispara todos os marcos vencidos de uma vez, nunca pula o
// mais antigo. Cada marco só entra se o campo correspondente ainda for null.
export function lembretesPendentes(
  pendencia: {
    criadaEm: Date;
    lembrete3EnviadoEm: Date | null;
    lembrete7EnviadoEm: Date | null;
    lembrete15EnviadoEm: Date | null;
  },
  agora: Date,
): MarcoLembrete[] {
  const dias = diasCorridos(pendencia.criadaEm, agora);
  const marcos: MarcoLembrete[] = [];
  if (dias >= 3 && !pendencia.lembrete3EnviadoEm) marcos.push(3);
  if (dias >= 7 && !pendencia.lembrete7EnviadoEm) marcos.push(7);
  if (dias >= 15 && !pendencia.lembrete15EnviadoEm) marcos.push(15);
  return marcos;
}

export type NivelUrgenciaPendencia = "normal" | "atencao" | "alerta" | "critico";

// Destaque visual crescente por idade — não depende dos campos lembreteXEnviadoEm
// (esses só controlam o envio Teams); só de criadaEm, então funciona mesmo
// antes da Task 1 rodar em algum ambiente (campo novo é opcional).
export function nivelUrgenciaPendencia(criadaEm: Date, agora: Date): NivelUrgenciaPendencia {
  const dias = diasCorridos(criadaEm, agora);
  if (dias >= 15) return "critico";
  if (dias >= 7) return "alerta";
  if (dias >= 3) return "atencao";
  return "normal";
}

export function classesUrgenciaPendencia(nivel: NivelUrgenciaPendencia): string {
  switch (nivel) {
    case "critico":
      return "border-red-300 bg-red-50";
    case "alerta":
      return "border-orange-300 bg-orange-50";
    case "atencao":
      return "border-amber-300 bg-amber-50";
    default:
      return "";
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/lembretesPendentes.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/politica/lembretesPendentes.ts tests/lembretesPendentes.test.ts
git commit -m "feat(pendencia): funcao pura lembretesPendentes + nivel de urgencia por idade"
```

---

### Task 3: Notificação Teams de lembrete e resumo SGI

**Files:**
- Modify: `lib/notificacao/graph.ts`
- Modify: `teams/manifest.json`
- Test: `tests/notificacao-graph.test.ts` (estender o existente)

**Interfaces:**
- Consumes: `msalApp`, `SCOPES_GRAPH_APP` de `lib/auth/msal` (já existentes); `authConfig` de `lib/auth/config` (já existente).
- Produces:
  - `type ResultadoNotificacao = { ok: true } | { ok: false; motivo: string }` (já existe, reaproveitado).
  - `function enviarNotificacaoLembretePendencia(params: { oid: string; tituloPolitica: string; politicaId: string; diasPendente: MarcoLembrete }): Promise<ResultadoNotificacao>` — usada pela Task 6.
  - `function enviarResumoPendenciasSgi(params: { oidsSgi: string[]; quantidade: number }): Promise<ResultadoNotificacao[]>` — usada pela Task 6.

- [ ] **Step 1: Rodar os testes existentes ANTES de mexer (linha de base)**

Run: `npx vitest run tests/notificacao-graph.test.ts`
Expected: PASS (2 testes) — confirma que o arquivo já funciona antes do refactor.

- [ ] **Step 2: Refatorar `lib/notificacao/graph.ts` extraindo helpers internos, preservando o comportamento de `enviarNotificacaoPoliticaPublicada` bit a bit**

Substituir o conteúdo inteiro de `lib/notificacao/graph.ts` por:

```ts
// Notificação de atividade do Teams (o sininho), via Microsoft Graph.
//
// Caminho escolhido: `POST /users/{oid}/teamwork/sendActivityNotification`, não
// Bot Framework. O app já é aba pessoal instalada — a Graph API entrega a
// notificação sem precisar de bot registrado nem de armazenar referência de
// conversa por usuário. Exige a permissão de APLICAÇÃO `TeamsActivity.Send`
// (não confundir com a variante RSC `TeamsActivity.Send.User`, que vive no
// manifest do Teams e segue outro fluxo de consentimento) — concedida com
// admin-consent no Entra para o app 1b98db67 em 2026-07-28.
//
// Cada `activityType` usado abaixo precisa constar em `teams/manifest.json`
// (bloco `activities.activityTypes`), senão o Teams não sabe renderizar o
// texto.
import { msalApp, SCOPES_GRAPH_APP } from "../auth/msal";
import { authConfig } from "../auth/config";
import type { MarcoLembrete } from "../politica/lembretesPendentes";

const TEAMS_APP_ID = "698c2c83-b704-4e0f-b5e5-f3095b054e58";
const TEAMS_TAB_ENTITY_ID = "gpol-painel";

export type ResultadoNotificacao = { ok: true } | { ok: false; motivo: string };

async function obterTokenGraph(): Promise<string> {
  const resultado = await msalApp().acquireTokenByClientCredential({ scopes: SCOPES_GRAPH_APP });
  const token = resultado?.accessToken;
  if (!token) throw new Error("token_graph: vazio");
  return token;
}

// Precisam bater com teams/manifest.json: "id" (raiz do manifest) e o
// staticTabs[].entityId da aba que renderiza /catalogo/{politicaId}. Sem
// subEntityId (resumo SGI, que não é sobre 1 política só), o context vem
// vazio — Graph aceita normalmente.
function montarWebUrlTeams(caminho: string, subEntityId?: string): string {
  const urlApp = `${authConfig.baseUrl.replace(/\/$/, "")}${caminho}`;
  const base = `https://teams.microsoft.com/l/entity/${TEAMS_APP_ID}/${TEAMS_TAB_ENTITY_ID}?webUrl=${encodeURIComponent(urlApp)}`;
  if (!subEntityId) return base;
  const contexto = encodeURIComponent(JSON.stringify({ subEntityId }));
  return `${base}&context=${contexto}`;
}

async function enviarAtividade(params: {
  oid: string;
  activityType: string;
  texto: string;
  webUrl: string;
}): Promise<ResultadoNotificacao> {
  let token: string;
  try {
    token = await obterTokenGraph();
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) };
  }

  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.oid)}/teamwork/sendActivityNotification`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: { source: "text", value: params.texto, webUrl: params.webUrl },
          activityType: params.activityType,
          previewText: { content: params.texto },
          recipient: {
            "@odata.type": "microsoft.graph.aadUserNotificationRecipient",
            userId: params.oid,
          },
        }),
      },
    );

    // 204 = aceito pelo Graph. Não garante que o usuário viu — só que a
    // notificação foi entregue ao Teams para exibição.
    if (resp.status === 204) return { ok: true };

    const corpo = await resp.text().catch(() => "");
    return { ok: false, motivo: `graph_${resp.status}: ${corpo.slice(0, 200)}` };
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function enviarNotificacaoPoliticaPublicada(params: {
  oid: string;
  tituloPolitica: string;
  politicaId: string;
}): Promise<ResultadoNotificacao> {
  const texto = `Norma publicada: ${params.tituloPolitica}`;
  return enviarAtividade({
    oid: params.oid,
    activityType: "politicaPublicada",
    texto,
    webUrl: montarWebUrlTeams(`/catalogo/${params.politicaId}`, params.politicaId),
  });
}

const TEXTO_MARCO: Record<MarcoLembrete, string> = {
  3: "3 dias",
  7: "7 dias",
  15: "15 dias",
};

export async function enviarNotificacaoLembretePendencia(params: {
  oid: string;
  tituloPolitica: string;
  politicaId: string;
  diasPendente: MarcoLembrete;
}): Promise<ResultadoNotificacao> {
  const texto = `Lembrete: "${params.tituloPolitica}" aguardando sua ciência há ${TEXTO_MARCO[params.diasPendente]}`;
  return enviarAtividade({
    oid: params.oid,
    activityType: "pendenciaLembrete",
    texto,
    webUrl: montarWebUrlTeams(`/catalogo/${params.politicaId}`, params.politicaId),
  });
}

// 1 chamada por destinatário SGI (a API do Teams só aceita recipient
// individual) — mas todos recebem o MESMO texto-resumo, nunca 1 notificação
// por colaborador travado.
export async function enviarResumoPendenciasSgi(params: {
  oidsSgi: string[];
  quantidade: number;
}): Promise<ResultadoNotificacao[]> {
  const texto = `${params.quantidade} ${params.quantidade === 1 ? "pessoa passou" : "pessoas passaram"} de 15 dias sem dar ciência`;
  const webUrl = montarWebUrlTeams("/catalogo");
  return Promise.all(
    params.oidsSgi.map((oid) =>
      enviarAtividade({ oid, activityType: "pendenciaResumoSgi", texto, webUrl }),
    ),
  );
}
```

- [ ] **Step 3: Rodar os testes existentes de novo — devem continuar passando sem alteração**

Run: `npx vitest run tests/notificacao-graph.test.ts`
Expected: PASS (2 testes) — mesmo comportamento externo, refactor não quebrou nada.

- [ ] **Step 4: Adicionar `activityTypes` novos ao manifest do Teams**

Em `teams/manifest.json`, dentro de `activities.activityTypes`, adicionar depois do `politicaPublicada` existente:

```json
      {
        "type": "pendenciaLembrete",
        "description": "Lembrete de ciência pendente",
        "templateText": "Lembrete: {politicaTitulo} aguardando sua ciência"
      },
      {
        "type": "pendenciaResumoSgi",
        "description": "Resumo de pendências vencidas",
        "templateText": "{quantidade} pessoas passaram de 15 dias sem dar ciência"
      }
```

- [ ] **Step 5: Escrever os testes novos**

Adicionar ao final de `tests/notificacao-graph.test.ts` (mantendo os `describe`/mocks já existentes no topo do arquivo):

```ts
import { enviarNotificacaoLembretePendencia, enviarResumoPendenciasSgi } from "@/lib/notificacao/graph";

describe("enviarNotificacaoLembretePendencia", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  it("usa activityType pendenciaLembrete e texto com o marco certo", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

    const resultado = await enviarNotificacaoLembretePendencia({
      oid: "oid-123",
      tituloPolitica: "Política de Teste",
      politicaId: "pol-abc",
      diasPendente: 7,
    });

    expect(resultado.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.activityType).toBe("pendenciaLembrete");
    expect(corpo.topic.value).toContain("7 dias");
    expect(corpo.topic.value).toContain("Política de Teste");
  });
});

describe("enviarResumoPendenciasSgi", () => {
  it("manda 1 notificacao por oid, todas com o mesmo texto-resumo", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        chamadas.push(url as string);
        return new Response(null, { status: 204 });
      }),
    );

    const resultados = await enviarResumoPendenciasSgi({
      oidsSgi: ["oid-sgi-1", "oid-sgi-2"],
      quantidade: 5,
    });

    expect(resultados).toEqual([{ ok: true }, { ok: true }]);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0]).toContain("oid-sgi-1");
    expect(chamadas[1]).toContain("oid-sgi-2");
  });

  it("quantidade 1 usa singular", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

    await enviarResumoPendenciasSgi({ oidsSgi: ["oid-sgi-1"], quantidade: 1 });

    const [, init] = fetchMock.mock.calls[0];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.topic.value).toContain("1 pessoa passou");
  });
});
```

- [ ] **Step 6: Rodar os testes novos e confirmar que passam**

Run: `npx vitest run tests/notificacao-graph.test.ts`
Expected: PASS (5 testes no total: 2 antigos + 3 novos).

- [ ] **Step 7: Commit**

```bash
git add lib/notificacao/graph.ts teams/manifest.json tests/notificacao-graph.test.ts
git commit -m "feat(notificacao): lembrete de pendencia e resumo SGI via Teams (Graph)"
```

---

### Task 4: Secret compartilhado do cron + rota protegida de lembretes

**Files:**
- Create: `lib/cron/secret.ts`
- Create: `app/api/cron/lembretes-pendencia/route.ts`
- Test: `tests/cron-lembretes-pendencia.test.ts`

**Interfaces:**
- Consumes: `lembretesPendentes` de `lib/politica/lembretesPendentes` (Task 2); `enviarNotificacaoLembretePendencia`, `enviarResumoPendenciasSgi` de `lib/notificacao/graph` (Task 3); `prisma` de `@/lib/prisma`.
- Produces: `CRON_SECRET`, `autorizadoCron(header: string | null): boolean` de `lib/cron/secret.ts` — usada só por esta rota (e futuramente por outras rotas de cron, se surgirem). Rota `POST /api/cron/lembretes-pendencia` — usada pelo script de trigger da Task 5.

- [ ] **Step 1: Criar `lib/cron/secret.ts`**

```ts
// Secret compartilhado entre o app e o Container Apps Job que dispara rotas
// de cron (ver docs/superpowers/specs/2026-08-02-lembretes-pendencia-ciencia-fase-d-design.md).
// Sem o secret configurado (ambiente de dev sem a env), NUNCA autoriza —
// fail-closed, não fail-open.
export const CRON_SECRET = process.env.CRON_SECRET?.trim() ?? "";

export function autorizadoCron(headerAutorizacao: string | null): boolean {
  if (!CRON_SECRET) return false;
  return headerAutorizacao === `Bearer ${CRON_SECRET}`;
}
```

- [ ] **Step 2: Escrever o teste da rota (falha primeiro)**

```ts
// tests/cron-lembretes-pendencia.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cron/secret", () => ({
  CRON_SECRET: "segredo-teste",
  autorizadoCron: (h: string | null) => h === "Bearer segredo-teste",
}));

const pendenciaFindMany = vi.fn();
const pendenciaUpdate = vi.fn();
const usuarioFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pendencia: { findMany: (...a: unknown[]) => pendenciaFindMany(...a), update: (...a: unknown[]) => pendenciaUpdate(...a) },
    usuario: { findMany: (...a: unknown[]) => usuarioFindMany(...a) },
  },
}));

const enviarNotificacaoLembretePendencia = vi.fn(async () => ({ ok: true }));
const enviarResumoPendenciasSgi = vi.fn(async () => [{ ok: true }]);

vi.mock("@/lib/notificacao/graph", () => ({
  enviarNotificacaoLembretePendencia: (...a: unknown[]) => enviarNotificacaoLembretePendencia(...a),
  enviarResumoPendenciasSgi: (...a: unknown[]) => enviarResumoPendenciasSgi(...a),
}));

import { POST } from "@/app/api/cron/lembretes-pendencia/route";

function req(autorizacao: string | null) {
  return new Request("http://localhost/api/cron/lembretes-pendencia", {
    method: "POST",
    headers: autorizacao ? { authorization: autorizacao } : {},
  });
}

describe("POST /api/cron/lembretes-pendencia", () => {
  beforeEach(() => {
    pendenciaFindMany.mockReset();
    pendenciaUpdate.mockReset();
    usuarioFindMany.mockReset();
    enviarNotificacaoLembretePendencia.mockReset().mockResolvedValue({ ok: true });
    enviarResumoPendenciasSgi.mockReset().mockResolvedValue([{ ok: true }]);
  });

  it("401 sem o secret certo", async () => {
    const resp = await POST(req(null));
    expect(resp.status).toBe(401);
  });

  it("401 com secret errado", async () => {
    const resp = await POST(req("Bearer errado"));
    expect(resp.status).toBe(401);
  });

  it("pula pendencia sem marco vencido e sem oid", async () => {
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm: new Date(),
        lembrete3EnviadoEm: null,
        lembrete7EnviadoEm: null,
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: null },
      },
    ]);

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.enviados).toBe(0);
    expect(enviarNotificacaoLembretePendencia).not.toHaveBeenCalled();
  });

  it("envia lembrete pro marco vencido e grava o campo certo", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 3);
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm,
        lembrete3EnviadoEm: null,
        lembrete7EnviadoEm: null,
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: "oid-1" },
      },
    ]);

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.enviados).toBe(1);
    expect(enviarNotificacaoLembretePendencia).toHaveBeenCalledWith(
      expect.objectContaining({ oid: "oid-1", diasPendente: 3 }),
    );
    expect(pendenciaUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { lembrete3EnviadoEm: expect.any(Date) },
    });
    expect(enviarResumoPendenciasSgi).not.toHaveBeenCalled();
  });

  it("dispara resumo SGI só quando alguem cruza 15 dias", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 15);
    pendenciaFindMany.mockResolvedValue([
      {
        id: "p1",
        politicaId: "pol1",
        criadaEm,
        lembrete3EnviadoEm: new Date(),
        lembrete7EnviadoEm: new Date(),
        lembrete15EnviadoEm: null,
        politica: { titulo: "Pol 1" },
        usuario: { oid: "oid-1" },
      },
    ]);
    usuarioFindMany.mockResolvedValue([{ oid: "oid-sgi-1" }]);

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.resumoSgi).toBe(1);
    expect(usuarioFindMany).toHaveBeenCalledWith({
      where: { perfil: "sgi", ativo: true, oid: { not: null } },
      select: { oid: true },
    });
    expect(enviarResumoPendenciasSgi).toHaveBeenCalledWith({ oidsSgi: ["oid-sgi-1"], quantidade: 1 });
  });

  it("falha ao enviar 1 lembrete nao aborta o lote (best-effort)", async () => {
    const criadaEm = new Date();
    criadaEm.setDate(criadaEm.getDate() - 3);
    pendenciaFindMany.mockResolvedValue([
      { id: "p1", politicaId: "pol1", criadaEm, lembrete3EnviadoEm: null, lembrete7EnviadoEm: null, lembrete15EnviadoEm: null, politica: { titulo: "Pol 1" }, usuario: { oid: "oid-1" } },
      { id: "p2", politicaId: "pol2", criadaEm, lembrete3EnviadoEm: null, lembrete7EnviadoEm: null, lembrete15EnviadoEm: null, politica: { titulo: "Pol 2" }, usuario: { oid: "oid-2" } },
    ]);
    enviarNotificacaoLembretePendencia
      .mockResolvedValueOnce({ ok: false, motivo: "graph_500: erro" })
      .mockResolvedValueOnce({ ok: true });

    const resp = await POST(req("Bearer segredo-teste"));
    const corpo = await resp.json();

    expect(resp.status).toBe(200);
    expect(corpo.enviados).toBe(1);
    expect(corpo.falhas).toBe(1);
    expect(pendenciaUpdate).toHaveBeenCalledTimes(1); // só a que teve sucesso grava o campo
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/cron-lembretes-pendencia.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/cron/lembretes-pendencia/route'`.

- [ ] **Step 4: Implementar a rota**

```ts
// app/api/cron/lembretes-pendencia/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizadoCron } from "@/lib/cron/secret";
import { lembretesPendentes, type MarcoLembrete } from "@/lib/politica/lembretesPendentes";
import { enviarNotificacaoLembretePendencia, enviarResumoPendenciasSgi } from "@/lib/notificacao/graph";

export const dynamic = "force-dynamic";

function campoDoMarco(marco: MarcoLembrete): "lembrete3EnviadoEm" | "lembrete7EnviadoEm" | "lembrete15EnviadoEm" {
  if (marco === 3) return "lembrete3EnviadoEm";
  if (marco === 7) return "lembrete7EnviadoEm";
  return "lembrete15EnviadoEm";
}

export async function POST(request: Request) {
  if (!autorizadoCron(request.headers.get("authorization"))) {
    return new NextResponse("Não autorizado", { status: 401 });
  }

  const agora = new Date();
  const pendentes = await prisma.pendencia.findMany({
    where: { estado: "pendente" },
    include: { politica: { select: { titulo: true } }, usuario: { select: { oid: true } } },
  });

  let enviados = 0;
  let falhas = 0;
  const cruzaramQuinzeDias: string[] = [];

  for (const p of pendentes) {
    const marcos = lembretesPendentes(p, agora);
    if (marcos.length === 0) continue;
    if (!p.usuario.oid) continue; // nunca logou — sem oid não há como notificar via Teams

    for (const marco of marcos) {
      const resultado = await enviarNotificacaoLembretePendencia({
        oid: p.usuario.oid,
        tituloPolitica: p.politica.titulo,
        politicaId: p.politicaId,
        diasPendente: marco,
      });

      if (resultado.ok) {
        enviados++;
        await prisma.pendencia.update({ where: { id: p.id }, data: { [campoDoMarco(marco)]: agora } });
        if (marco === 15) cruzaramQuinzeDias.push(p.id);
      } else {
        falhas++;
        console.error(`Falha ao enviar lembrete (marco ${marco}) pendencia ${p.id}:`, resultado.motivo);
      }
    }
  }

  let resumoSgi = 0;
  if (cruzaramQuinzeDias.length > 0) {
    const sgi = await prisma.usuario.findMany({
      where: { perfil: "sgi", ativo: true, oid: { not: null } },
      select: { oid: true },
    });
    const oidsSgi = sgi.map((u) => u.oid).filter((oid): oid is string => Boolean(oid));
    if (oidsSgi.length > 0) {
      await enviarResumoPendenciasSgi({ oidsSgi, quantidade: cruzaramQuinzeDias.length });
      resumoSgi = cruzaramQuinzeDias.length;
    }
  }

  return NextResponse.json({ ok: true, enviados, falhas, resumoSgi });
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/cron-lembretes-pendencia.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add lib/cron/secret.ts app/api/cron/lembretes-pendencia/route.ts tests/cron-lembretes-pendencia.test.ts
git commit -m "feat(cron): rota protegida que varre pendencias e dispara lembretes/resumo SGI"
```

---

### Task 5: Destaque visual por idade (home e sino)

**Files:**
- Modify: `app/(shell)/page.tsx:98-116` (bloco `pendentesCiencia`)
- Modify: `components/shell/SinoNotificacoes.tsx`

**Interfaces:**
- Consumes: `nivelUrgenciaPendencia`, `classesUrgenciaPendencia` de `lib/politica/lembretesPendentes` (Task 2).

- [ ] **Step 1: Aplicar destaque na home (`app/(shell)/page.tsx`)**

No topo do arquivo, adicionar o import (junto aos demais imports já existentes):

```ts
import { nivelUrgenciaPendencia, classesUrgenciaPendencia } from "@/lib/politica/lembretesPendentes";
```

Substituir o bloco do `<ul>` de pendências (linhas ~105-114) por:

```tsx
            <ul className="divide-y divide-black/5">
              {pendentesCiencia.map((p) => {
                const nivel = nivelUrgenciaPendencia(p.criadaEm, new Date());
                const classes = classesUrgenciaPendencia(nivel);
                return (
                  <li
                    key={p.id}
                    className={`flex items-center justify-between rounded-md px-2 py-2.5 text-sm ${classes || "border-transparent"}`}
                  >
                    <Link href={`/catalogo/${p.politica.id}`} className="font-medium text-marsala hover:underline">{p.politica.titulo}</Link>
                    <span className="text-xs text-black/40">
                      publicada {tempoRelativo(p.politicaPublicadaEm)}
                    </span>
                  </li>
                );
              })}
            </ul>
```

- [ ] **Step 2: Aplicar destaque no sino (`components/shell/SinoNotificacoes.tsx`)**

No topo do arquivo, adicionar o import:

```ts
import { nivelUrgenciaPendencia, classesUrgenciaPendencia } from "@/lib/politica/lembretesPendentes";
```

Substituir o `<li>` dentro do `.map` (bloco atual `itens.map((it) => (...))`) por:

```tsx
              {itens.map((it) => {
                const nivel = nivelUrgenciaPendencia(new Date(it.criadaEm), new Date());
                const classes = classesUrgenciaPendencia(nivel);
                return (
                  <li key={it.id} className={`border-t border-black/5 first:border-t-0 ${classes}`}>
                    <Link href={`/catalogo/${it.politicaId}`} className="block px-3 py-2 hover:bg-black/5">
                      <div className="text-sm text-black/80">{it.titulo}</div>
                      <div className="mt-0.5 text-[11px] text-black/40">{tipoDocumento(it.tipo).rotulo}</div>
                    </Link>
                  </li>
                );
              })}
```

- [ ] **Step 3: Rodar typecheck e testes existentes de UI (garantir que nada quebrou)**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erros de tipo, todos os testes existentes continuam PASS (não há teste automatizado pra classe CSS renderizada — verificação visual entra na Task 7).

- [ ] **Step 4: Commit**

```bash
git add "app/(shell)/page.tsx" components/shell/SinoNotificacoes.tsx
git commit -m "feat(pendencia): destaque visual crescente por idade na home e no sino"
```

---

### Task 6: Infraestrutura — Container Apps Job agendado

**Files:**
- Create: `jobs/lembretes-pendencia.js`
- Modify: `Dockerfile`
- Modify: `infra/bicep/modules/containerApp.bicep` (novo env var `CRON_SECRET`)
- Create: `infra/bicep/modules/containerAppJob.bicep`
- Modify: `infra/bicep/main.bicep`
- Modify: `infra/bicep/environments/hml.bicepparam`
- Modify: `infra/bicep/README.md`

**Interfaces:**
- Consumes: `APP_BASE_URL`, `CRON_SECRET` (env vars, runtime — não há interface de código, é infra pura).
- Produces: Container Apps Job `caj-gpol-hml-lembretes` (Bicep), que dispara `POST /api/cron/lembretes-pendencia` (Task 4) 1x/dia.

- [ ] **Step 1: Criar o script de trigger (JS puro, sem TypeScript)**

```js
// jobs/lembretes-pendencia.js
//
// Dispara a rota protegida /api/cron/lembretes-pendencia. JS puro (não TS):
// o output standalone do Next não inclui scripts TypeScript soltos nem o
// compilador — só o runtime Node e o que o build do Next rastreia. Este
// arquivo é copiado explicitamente no Dockerfile (ver COPY jobs ./jobs) pra
// existir na imagem de runtime.
const baseUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!baseUrl || !secret) {
  console.error("APP_BASE_URL ou CRON_SECRET ausente — abortando.");
  process.exit(1);
}

fetch(`${baseUrl}/api/cron/lembretes-pendencia`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
})
  .then(async (resp) => {
    const corpo = await resp.text();
    console.log(`status=${resp.status} corpo=${corpo}`);
    if (!resp.ok) process.exit(1);
  })
  .catch((erro) => {
    console.error("Falha na chamada:", erro);
    process.exit(1);
  });
```

- [ ] **Step 2: Copiar o script pra imagem de runtime no Dockerfile**

Em `Dockerfile`, no estágio `runner`, logo após a linha `COPY --from=builder /app/templates ./templates`:

```dockerfile
COPY --from=builder /app/jobs ./jobs
```

- [ ] **Step 3: Adicionar `CRON_SECRET` ao Container App (`infra/bicep/modules/containerApp.bicep`)**

Adicionar novo parâmetro secreto, perto dos outros `@secure()` params (depois de `openAiKey`):

```bicep
@secure()
@description('CRON_SECRET (autoriza o Container Apps Job a chamar /api/cron/*)')
param cronSecret string
```

Adicionar o secret na lista `secrets` (dentro de `configuration.secrets`, depois de `{ name: 'openaikey', value: openAiKey }`):

```bicep
        { name: 'cronsecret', value: cronSecret }
```

Adicionar o env var na lista `env` do container (depois de `{ name: 'DOMINIOS_ORG', value: dominiosOrg }`):

```bicep
          { name: 'CRON_SECRET', secretRef: 'cronsecret' }
```

- [ ] **Step 4: Criar o módulo do Container Apps Job**

```bicep
// infra/bicep/modules/containerAppJob.bicep
//
// Job agendado (cron) que dispara a rota protegida /api/cron/lembretes-pendencia
// do Container App já existente — não roda lógica própria, só um fetch (ver
// jobs/lembretes-pendencia.js). Mesma imagem do Container App.

@description('Nome do Container Apps Job.')
param name string

@description('Região.')
param location string

@description('Resource ID do managed environment.')
param environmentId string

@description('Login server do ACR.')
param acrLoginServer string

@description('Usuário do ACR (admin user).')
param acrUsername string

@secure()
@description('Senha do ACR (admin user).')
param acrPassword string

@description('Imagem completa (mesma do Container App).')
param image string

@description('APP_BASE_URL — o job monta a URL da rota protegida a partir daqui.')
param appBaseUrl string

@secure()
@description('CRON_SECRET — mesmo valor configurado no Container App.')
param cronSecret string

@description('Expressão cron (UTC). Baseline: 03:00 diário.')
param cronExpression string = '0 3 * * *'

var acrPasswordSecretName = 'acrpassword'
var cronSecretName = 'cronsecret'

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: name
  location: location
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 300
      replicaRetryLimit: 1
      registries: [
        { server: acrLoginServer, username: acrUsername, passwordSecretRef: acrPasswordSecretName }
      ]
      secrets: [
        { name: acrPasswordSecretName, value: acrPassword }
        { name: cronSecretName, value: cronSecret }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: image
          command: ['node', 'jobs/lembretes-pendencia.js']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'APP_BASE_URL', value: appBaseUrl }
            { name: 'CRON_SECRET', secretRef: cronSecretName }
          ]
        }
      ]
    }
  }
}

output name string = job.name
```

- [ ] **Step 5: Adicionar `cronSecret`, `cronExpression` e o novo param de nome ao `main.bicep`**

Em `infra/bicep/main.bicep`, adicionar aos parâmetros de nome (perto de `param containerAppName string`):

```bicep
param containerAppJobName string
```

Adicionar aos "Config do app" (perto de `param dominiosOrg string = 'aahbrant.com'`):

```bicep
param cronExpression string = '0 3 * * *'
```

Adicionar aos secrets (perto de `@secure() param openAiKey string`):

```bicep
@secure()
param cronSecret string
```

Adicionar `cronSecret: cronSecret` aos params do módulo `containerApp` existente (junto de `openAiKey: openAiKey`).

Adicionar o módulo novo, depois do módulo `containerApp` existente:

```bicep
module lembretesJob 'modules/containerAppJob.bicep' = {
  name: 'lembretesJob'
  params: {
    name: containerAppJobName
    location: location
    environmentId: containerEnv.outputs.id
    acrLoginServer: acr.outputs.loginServer
    acrUsername: acrUsername
    acrPassword: acrPassword
    image: image
    appBaseUrl: appBaseUrl
    cronSecret: cronSecret
    cronExpression: cronExpression
  }
}
```

- [ ] **Step 6: Adicionar o nome do Job ao `hml.bicepparam`**

Em `infra/bicep/environments/hml.bicepparam`, adicionar junto aos outros params de nome (perto de `param containerAppName = '...'`):

```bicep
param containerAppJobName = 'caj-gpol-hml-lembretes'
```

(`cronSecret` é passado via `--parameters cronSecret=$GPOL_CRON_SECRET` na hora do `az deployment group create`, igual aos outros secrets — nunca commitado.)

- [ ] **Step 7: Validar que o Bicep compila**

Run: `az bicep build --file infra/bicep/main.bicep --stdout`
Expected: sem erro (mesma validação que já roda no CI, `azure-pipelines.yml` step "Validar Bicep").

- [ ] **Step 8: Atualizar `infra/bicep/README.md` (documento vivo — regra do próprio README)**

Adicionar linha na tabela de topologia (depois de `Container App`):

```markdown
| Container Apps Job | `caj-gpol-hml-lembretes` | 0.25vCPU/0.5Gi, cron `0 3 * * *` | brazilsouth |
```

Adicionar ao final da lista de "Débito consciente":

```markdown
- **Container Apps Job dispara a rota via HTTP, não roda lógica própria** —
  decisão deliberada (ver spec da Fase D): o output standalone do Next não
  inclui scripts soltos, então a lógica mora numa rota de API já rastreada
  pelo build; o Job só faz 1 fetch autenticado por secret.
```

- [ ] **Step 9: Commit**

```bash
git add jobs/lembretes-pendencia.js Dockerfile infra/bicep
git commit -m "feat(infra): Container Apps Job agendado dispara rota de lembretes"
```

---

### Task 7: Verificação final + PR

**Files:** nenhum arquivo novo — esta task só verifica o branch inteiro e abre a PR.

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 0 erros de tipo, 0 warnings de lint, todos os testes PASS (existentes + novos desta fase).

- [ ] **Step 2: Revisão do branch inteiro (dispachar um review, não confiar só nos testes unitários)**

Usar um subagente de revisão (mesmo padrão das Fases anteriores) apontando pro diff completo do branch contra `main`, pedindo atenção especial a:
- Idempotência: nenhum caminho grava `lembreteXEnviadoEm` antes de confirmar sucesso do envio.
- Best-effort: falha em 1 Graph call nunca aborta o loop nem derruba a rota (sempre responde 200 com contagem de falhas, nunca 500 por causa de 1 usuário).
- `CRON_SECRET` ausente = 401 sempre (fail-closed), nunca fail-open.
- SGI: só usuários `ativo: true` e com `oid` não-nulo entram no resumo.
- Nenhuma referência nova ao perfil "Gestor de Setor" (decisão de negócio registrada na spec).

Aplicar as correções que o review encontrar antes de prosseguir (mesmo fluxo das fases anteriores: 1 onda de fix, re-revisão só se algo ficar em aberto).

- [ ] **Step 3: Verificação manual end-to-end**

Localmente, com o dev server rodando (`npm run dev -- -p <porta>`) e `CRON_SECRET` setado no `.env`:
1. Criar (ou usar) uma `Pendencia` real de teste e forçar `criadaEm` pra 3 dias atrás via update direto no banco.
2. Chamar `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:<porta>/api/cron/lembretes-pendencia`.
3. Confirmar no retorno JSON que `enviados` inclui essa pendência e que `lembrete3EnviadoEm` foi gravado no banco (`SELECT` direto ou Prisma Studio).
4. Chamar a rota de novo imediatamente — confirmar que `enviados` NÃO conta essa mesma pendência de novo (idempotência).
5. Reverter os dados de teste criados (apagar a `Pendencia` de teste, `.env` de volta ao normal).

- [ ] **Step 4: Commit final (se o review gerar mudanças) e abrir a PR**

```bash
git push -u origin <nome-do-branch>
az repos pr create --title "feat: lembretes automaticos de ciencia pendente (Fase D)" --description "..." --auto-complete true --squash false --delete-source-branch true
```

Sinalizar na descrição da PR: migration nova (`pendencia_lembretes`), infra nova (Container Apps Job — precisa `az deployment group create` com `GPOL_CRON_SECRET` novo depois do merge, não é automático só com o merge do código).
