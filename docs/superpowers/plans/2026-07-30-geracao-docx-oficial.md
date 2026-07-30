# Geração automática do documento oficial (.docx) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao publicar uma política, gerar automaticamente o documento Word
oficial (`.docx`) a partir do modelo real da AAHBRANT, salvá-lo como uma
"Versão" (marcada como documento oficial), e bloquear a publicação se a
geração falhar.

**Architecture:** `docx-templates` (MIT) preenche `templates/politica-modelo.docx`
(modelo Word real, tags já inseridas) com os dados da política. Hook dentro
de `publicarPolitica` (server action já existente), antes de confirmar a
publicação no banco (fail-closed). Reaproveita `salvarArquivo()`/`/api/documentos/[id]`
já existentes. Campo novo `Documento.oficial` distingue o gerado (substituição
automática a cada republicação) do upload manual (anexo, convive com outros).

**Tech Stack:** Next.js 14 (App Router, Server Actions), Prisma 5.17/PostgreSQL,
`docx-templates` 4.x, Vitest.

## Global Constraints

- Licença: só bibliotecas MIT/permissivas — **nunca** `docxtemplater` (AGPL no
  núcleo gratuito, incompatível com app proprietário rodando como serviço).
- Fail-closed: falha em gerar o `.docx` **bloqueia a publicação inteira** — a
  política continua em `rascunho`, nada é salvo no banco.
- Nunca `catch {}` silencioso — logar/propagar a mensagem real do erro (ver
  `docs/learnings.md`).
- Migração de schema: expand puro (`ADD COLUMN ... DEFAULT`), sem quebrar
  dados existentes.
- Todo código novo roda `npx tsc --noEmit`, `npx eslint . --ext .ts,.tsx` e
  `npx vitest run` limpos antes de cada commit.

---

## Contexto já resolvido (não repetir)

- **`templates/politica-modelo.docx` já existe no repo**, construído e
  testado nesta sessão a partir do modelo Word real enviado pelo usuário.
  Contém as tags (delimitador `{ }`, biblioteca `docx-templates`):
  - Cabeçalho: `{titulo}`, `{codigo}`, `{data}`, `{unidade}`, `{areaResponsavel}`, `{revisao}`
  - Corpo: `{FOR secao IN secoes}` / `{$secao.codigo}` / `{$secao.titulo}` / `{$secao.corpo}` / `{END-FOR secao}`
  - O campo "Página X de Y" é campo nativo do Word (`PAGE`/`NUMPAGES`) — já
    funciona sozinho, **nenhuma tag necessária**.
- **Teste manual já validado** (fora deste plano, na sessão de brainstorming):
  gerar com dados de exemplo e extrair o texto do `.docx` resultante confirma
  substituição correta de todas as tags, sem sobras de `{FOR}`/`{END-FOR}`.
- Seções do tipo `tabela` (colunas/linhas) **não** viram tabela Word real
  nesta v1 — vira texto simples (linhas separadas por quebra, células por
  ` | `). É uma simplificação deliberada (ver Task 2) — perda de fidelidade
  pontual, não do cabeçalho/rodapé (que é o problema que motivou a feature).

---

### Task 1: Dependência + Dockerfile

**Files:**
- Modify: `package.json`
- Modify: `Dockerfile:19-22` (estágio `runner`, logo após o `COPY` de `public/`)

**Interfaces:**
- Produces: pacote `docx-templates` disponível para import em `lib/`; pasta
  `templates/` presente na imagem Docker final (mesma classe de fix da PR #49
  para `public/`).

- [ ] **Step 1: Instalar a dependência**

```bash
npm install docx-templates
npm install --save-dev jszip
```

(`docx-templates` já traz `jszip` como dependência transitiva de runtime —
`jszip` aqui é só para o teste do Task 2 conseguir abrir o `.docx` gerado e
inspecionar o XML.)

- [ ] **Step 2: Confirmar a versão instalada**

Run: `grep '"docx-templates"' package.json`
Expected: uma linha com uma versão `^4.x` (testada nesta sessão com `4.15.0`).

- [ ] **Step 3: Copiar `templates/` para a imagem final no Dockerfile**

Editar o Dockerfile, no estágio `# ---- runtime ----`, logo após a linha que
copia `public/` (adicionada na PR #49):

```dockerfile
COPY --from=builder /app/public ./public
COPY --from=builder /app/templates ./templates
```

- [ ] **Step 4: Build local da imagem e verificação do arquivo dentro do container**

```bash
docker build -t gpoliticas:test-templates .
docker run --rm --entrypoint sh gpoliticas:test-templates -c "ls -la templates/"
```

Expected: lista `politica-modelo.docx` com o mesmo tamanho do arquivo no repo
(`ls -la templates/politica-modelo.docx` no host, comparar bytes).

- [ ] **Step 5: Limpar a imagem de teste**

```bash
docker rmi gpoliticas:test-templates
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json Dockerfile
git commit -m "build: adiciona docx-templates e copia templates/ para a imagem"
```

---

### Task 2: Função pura de geração do `.docx` (`lib/politica/gerarDocx.ts`)

**Files:**
- Create: `lib/politica/gerarDocx.ts`
- Modify: `lib/politica/dominio.ts` (nova função pura `corpoParaTexto`)
- Test: `tests/dominio.test.ts` (teste de `corpoParaTexto`)
- Test: `tests/gerarDocx.test.ts` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores (função pura + leitura de arquivo).
- Produces:
  - `corpoParaTexto(secao: { tipo: string; corpo: string; colunas?: unknown; linhas?: unknown }): string` — em `lib/politica/dominio.ts`.
  - `type SecaoDocx = { codigo: string; titulo: string; corpo: string }` — em `lib/politica/gerarDocx.ts`.
  - `type DadosDocumentoOficial = { titulo: string; codigo: string | null; publicadaEm: Date; areaNome: string; revisao: number; secoes: SecaoDocx[] }` — em `lib/politica/gerarDocx.ts`.
  - `async function gerarDocumentoOficial(dados: DadosDocumentoOficial): Promise<Buffer>` — em `lib/politica/gerarDocx.ts`. Lança (`throw`) se o template não puder ser lido ou preenchido — **nunca engole o erro**.

- [ ] **Step 1: Escrever o teste de `corpoParaTexto` (falhando)**

Adicionar em `tests/dominio.test.ts` (dentro de um novo `describe`, no final do arquivo, antes do último `});` de fechamento do arquivo — ver estrutura existente do arquivo):

```ts
describe("corpoParaTexto (achatamento de seção-tabela para texto)", () => {
  it("seção de texto: devolve o corpo como está", () => {
    expect(corpoParaTexto({ tipo: "texto", corpo: "Um parágrafo qualquer." })).toBe(
      "Um parágrafo qualquer.",
    );
  });

  it("seção de tabela: cabeçalho + linhas, células separadas por ' | '", () => {
    const resultado = corpoParaTexto({
      tipo: "tabela",
      corpo: "",
      colunas: ["Termo", "Definição"],
      linhas: [
        ["Ativo", "Bem de valor econômico."],
        ["Passivo", "Obrigação a pagar."],
      ],
    });
    expect(resultado).toBe(
      "Termo | Definição\nAtivo | Bem de valor econômico.\nPassivo | Obrigação a pagar.",
    );
  });

  it("seção de tabela sem colunas definidas: só as linhas", () => {
    const resultado = corpoParaTexto({ tipo: "tabela", corpo: "", colunas: null, linhas: [["a", "b"]] });
    expect(resultado).toBe("a | b");
  });

  it("seção de tabela vazia: string vazia", () => {
    expect(corpoParaTexto({ tipo: "tabela", corpo: "", colunas: null, linhas: null })).toBe("");
  });
});
```

E adicionar `corpoParaTexto` ao bloco de `import` no topo do arquivo (junto
dos outros imports de `@/lib/politica/dominio`).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/dominio.test.ts`
Expected: FAIL — `corpoParaTexto is not defined` (ainda não existe).

- [ ] **Step 3: Implementar `corpoParaTexto` em `lib/politica/dominio.ts`**

Adicionar no final do arquivo (depois de `leituraValida`):

```ts
// ---------------------------------------------------------------------------
// Geração do documento oficial (.docx)
// ---------------------------------------------------------------------------

// Achata uma seção pro texto simples do .docx gerado. Seção de tabela vira
// linhas separadas por quebra, células por " | " — v1 não gera tabela Word
// real (ver docs/superpowers/specs/2026-07-30-geracao-docx-oficial-design.md,
// "Não-objetivos"), só o cabeçalho/rodapé precisam de fidelidade perfeita.
export function corpoParaTexto(secao: {
  tipo: string;
  corpo: string;
  colunas?: unknown;
  linhas?: unknown;
}): string {
  if (secao.tipo !== "tabela") return secao.corpo;
  const colunas = (secao.colunas as string[] | null) ?? [];
  const linhas = (secao.linhas as string[][] | null) ?? [];
  const partes: string[] = [];
  if (colunas.length > 0) partes.push(colunas.join(" | "));
  for (const linha of linhas) partes.push(linha.join(" | "));
  return partes.join("\n");
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/dominio.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 4 novos).

- [ ] **Step 5: Escrever o teste de `gerarDocumentoOficial` (falhando)**

Criar `tests/gerarDocx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";

// Extrai o texto de um XML do Word (mesma técnica usada para inspecionar o
// modelo original durante o desenho da feature).
function extrairTexto(xml: string): string {
  let out = "";
  const re = /<w:t[^>]*>([^<]*)<\/w:t>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out += m[0] === "</w:p>" ? "\n" : m[1];
  }
  return out;
}

describe("gerarDocumentoOficial", () => {
  it("preenche cabeçalho e seções no modelo real (templates/politica-modelo.docx)", async () => {
    const buffer = await gerarDocumentoOficial({
      titulo: "POLÍTICA DE TESTE AUTOMATIZADO",
      codigo: "AHBT-POL-TI-999",
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
      areaNome: "Tecnologia da Informação",
      revisao: 3,
      secoes: [
        { codigo: "1", titulo: "Objetivo", corpo: "Texto de teste do objetivo." },
        { codigo: "2", titulo: "Abrangência", corpo: "Texto de teste da abrangência." },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const header = extrairTexto(await zip.file("word/header1.xml")!.async("string"));
    const corpo = extrairTexto(await zip.file("word/document.xml")!.async("string"));

    expect(header).toContain("POLÍTICA DE TESTE AUTOMATIZADO");
    expect(header).toContain("AHBT-POL-TI-999");
    expect(header).toContain("Tecnologia da Informação");
    expect(header).toContain("Revisão: 03");
    expect(header).toContain("30/07/2026");

    expect(corpo).toContain("1 · Objetivo");
    expect(corpo).toContain("Texto de teste do objetivo.");
    expect(corpo).toContain("2 · Abrangência");
    expect(corpo).toContain("Texto de teste da abrangência.");
    // Sem sobra de sintaxe de template (loop malformado ou tag sem substituir).
    expect(corpo).not.toContain("{FOR");
    expect(corpo).not.toContain("{END-FOR");
  });

  it("propaga o erro se o template não existir (nunca engole)", async () => {
    // process.cwd() é a raiz do projeto durante o vitest — não dá pra
    // simular "arquivo ausente" sem mexer no cwd. Em vez disso, confirma o
    // contrato: uma chamada com secoes vazias ainda deve gerar um buffer
    // válido (não lança à toa quando não há conteúdo — quem decide bloquear
    // por falta de conteúdo é `temConteudo`, em publicarPolitica).
    const buffer = await gerarDocumentoOficial({
      titulo: "SEM SEÇÕES",
      codigo: null,
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
      areaNome: "Qualidade",
      revisao: 0,
      secoes: [],
    });
    expect(buffer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run tests/gerarDocx.test.ts`
Expected: FAIL — `Cannot find module '@/lib/politica/gerarDocx'`.

- [ ] **Step 7: Implementar `lib/politica/gerarDocx.ts`**

```ts
import fs from "fs/promises";
import path from "path";
import { createReport } from "docx-templates";

// Modelo Word real (não uma reprodução em HTML) — ver
// docs/superpowers/specs/2026-07-30-geracao-docx-oficial-design.md.
const CAMINHO_MODELO = path.join(process.cwd(), "templates", "politica-modelo.docx");

export type SecaoDocx = {
  codigo: string;
  titulo: string;
  corpo: string; // já achatado por corpoParaTexto (lib/politica/dominio.ts)
};

export type DadosDocumentoOficial = {
  titulo: string;
  codigo: string | null;
  publicadaEm: Date;
  areaNome: string;
  revisao: number;
  secoes: SecaoDocx[];
};

// Gera o .docx oficial preenchendo o modelo real. Erros de leitura do
// template ou de preenchimento (tag ausente, XML inválido) SOBEM para o
// chamador — nunca engolir aqui (ver docs/learnings.md, regra sobre catch
// silencioso). Quem decide o que fazer com a falha é publicarPolitica
// (fail-closed: bloqueia a publicação).
export async function gerarDocumentoOficial(dados: DadosDocumentoOficial): Promise<Buffer> {
  const template = await fs.readFile(CAMINHO_MODELO);
  const resultado = await createReport({
    template,
    cmdDelimiter: ["{", "}"],
    data: {
      titulo: dados.titulo,
      codigo: dados.codigo ?? "—",
      data: dados.publicadaEm.toLocaleDateString("pt-BR"),
      unidade: "",
      areaResponsavel: dados.areaNome,
      revisao: String(dados.revisao).padStart(2, "0"),
      secoes: dados.secoes,
    },
  });
  return Buffer.from(resultado);
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run tests/gerarDocx.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 9: Rodar a suíte inteira + tsc + lint**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

Expected: tudo limpo, 0 erros, todos os testes passando.

- [ ] **Step 10: Commit**

```bash
git add lib/politica/dominio.ts lib/politica/gerarDocx.ts tests/dominio.test.ts tests/gerarDocx.test.ts
git commit -m "feat(docx): gerarDocumentoOficial preenche o modelo Word real"
```

---

### Task 3: Campo `Documento.oficial` (schema + migration)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730100000_documento_oficial/migration.sql`

**Interfaces:**
- Produces: `Documento.oficial: boolean` (default `false`) disponível no
  Prisma Client depois de `npx prisma generate`.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, no `model Documento`, adicionar o campo (depois de
`estado`):

```prisma
model Documento {
  id        String          @id @default(cuid())
  versao    Versao          @relation(fields: [versaoId], references: [id])
  versaoId  String          @unique
  nome      String
  tipo      String
  tamanho   Int
  hash      String          @unique
  estado    EstadoDocumento @default(importado)
  // v3: true = gerado automaticamente na publicação (documento oficial,
  // substitui o anterior a cada republicação); false = anexo manual (ex.:
  // planilha de apoio) - convive com outros anexos, nunca substitui nada.
  oficial   Boolean         @default(false)
  enviadoEm DateTime        @default(now())
}
```

- [ ] **Step 2: Criar a pasta e o arquivo da migration**

```bash
mkdir -p prisma/migrations/20260730100000_documento_oficial
```

Criar `prisma/migrations/20260730100000_documento_oficial/migration.sql`:

```sql
-- Distingue documento oficial (gerado na publicação) de anexo manual.
-- Expand puro: default false faz todo Documento já existente (uploads
-- manuais de hoje) virar "anexo" - semanticamente correto, sem quebrar dado.
ALTER TABLE "Documento" ADD COLUMN "oficial" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Aplicar local e regenerar o client**

```bash
npx prisma migrate deploy
npx prisma generate
```

Expected: `Applying migration '20260730100000_documento_oficial' ... All
migrations have been successfully applied.`

- [ ] **Step 4: Confirmar que o tipo aparece no client gerado**

Run: `npx tsc --noEmit`
Expected: sem erros (o campo `oficial` ainda não é usado em lugar nenhum
nesta etapa — só precisa compilar).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260730100000_documento_oficial
git commit -m "feat(schema): Documento.oficial distingue gerado de anexo manual"
```

---

### Task 4: Hook na publicação — geração fail-closed (`estado-actions.ts`)

**Files:**
- Modify: `app/(shell)/catalogo/[id]/estado-actions.ts`
- Test: `tests/estado-actions.test.ts` (novo)

**Interfaces:**
- Consumes: `gerarDocumentoOficial` e `SecaoDocx` (Task 2); `corpoParaTexto`
  (Task 2); `Documento.oficial` (Task 3); `salvarArquivo` (já existe em
  `@/lib/storage`); `proximoNumeroVersao` (já existe em `@/lib/politica/dominio`).
- Produces: `publicarPolitica` passa a criar uma `Versao`+`Documento` (oficial)
  a cada publicação bem-sucedida; retorna `{ ok: false, erro: "..." }` sem
  tocar o banco se a geração falhar.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/estado-actions.test.ts`. Segue exatamente o estilo de mock já
usado em `tests/admin-actions.test.ts` (vi.mock com `vi.fn()` inline na
fábrica, depois import + cast `as ReturnType<typeof vi.fn>`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podePublicar: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

vi.mock("@/lib/notificacao/graph", () => ({
  enviarNotificacaoPoliticaPublicada: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({ salvarArquivo: vi.fn() }));

vi.mock("@/lib/politica/gerarDocx", () => ({ gerarDocumentoOficial: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podePublicar } from "@/lib/auth/usuario";
import { enviarNotificacaoPoliticaPublicada } from "@/lib/notificacao/graph";
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import { publicarPolitica } from "@/app/(shell)/catalogo/[id]/estado-actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const publicarPermitido = podePublicar as ReturnType<typeof vi.fn>;
const notificar = enviarNotificacaoPoliticaPublicada as ReturnType<typeof vi.fn>;
const salvar = salvarArquivo as ReturnType<typeof vi.fn>;
const gerar = gerarDocumentoOficial as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const politicaUpdate = prisma.politica.update as ReturnType<typeof vi.fn>;
const transacao = prisma.$transaction as ReturnType<typeof vi.fn>;

const versaoCreate = vi.fn();
const versaoUpdateMany = vi.fn();
const versaoCount = vi.fn();

function politicaBase() {
  return {
    id: "p1",
    titulo: "Política de Teste",
    codigo: "AHBT-POL-TI-001",
    estado: "rascunho",
    publicadaEm: null,
    revisao: 0,
    area: { id: "a1", nome: "Tecnologia da Informação" },
    secoes: [{ ordem: 1, codigo: "1", titulo: "Objetivo", tipo: "texto", corpo: "Texto.", colunas: null, linhas: null }],
  };
}

describe("publicarPolitica — geração do documento oficial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Teste", email: "teste@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    transacao.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
  });

  it("gera o .docx, salva e publica quando a geração funciona", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(versaoCreate).toHaveBeenCalledTimes(1);
    expect(versaoCreate.mock.calls[0][0].data.documento.create.oficial).toBe(true);
  });

  it("fail-closed: se a geração falhar, não publica e não mexe no banco", async () => {
    findUnique.mockResolvedValue(politicaBase());
    gerar.mockRejectedValue(new Error("template quebrado"));

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toMatch(/documento oficial/i);
    expect(politicaUpdate).not.toHaveBeenCalled();
    expect(versaoCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: FAIL (comportamento de geração/fail-closed ainda não existe —
`mockGerar` não é chamado, `resultado.erro` não bate com o esperado no
segundo teste).

- [ ] **Step 3: Implementar em `estado-actions.ts`**

Adicionar aos imports do topo do arquivo:

```ts
import { salvarArquivo } from "@/lib/storage";
import { gerarDocumentoOficial } from "@/lib/politica/gerarDocx";
import {
  transicao,
  temConteudo,
  montarSnapshot,
  corpoParaTexto,
  proximoNumeroVersao,
  audienciaVazia,
  unirAudiencia,
  type Estado,
  type UsuarioAlvo,
} from "@/lib/politica/dominio";
```

Substituir a função `publicarPolitica` inteira por:

```ts
export async function publicarPolitica(id: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podePublicar(usuario)) return { ok: false, erro: "Sem permissão para publicar (apenas Diretoria/admin)." };

  const politica = await prisma.politica.findUnique({
    where: { id },
    include: { secoes: true, area: true },
  });
  if (!politica) return { ok: false, erro: "Política não encontrada." };

  const t = transicao(politica.estado as Estado, "publicar");
  if (!t.ok) return { ok: false, erro: t.erro };
  if (!temConteudo(politica.secoes)) {
    return { ok: false, erro: "Não é possível publicar sem conteúdo — preencha ao menos uma seção." };
  }

  const snapshot = montarSnapshot(politica.secoes);
  const novaRevisao = politica.publicadaEm ? politica.revisao + 1 : politica.revisao;
  const agora = new Date();

  // Fail-closed (ver docs/DEPLOY.md e a spec desta feature): sem o
  // documento oficial gerado, a política NÃO fica publicada.
  let docxBuffer: Buffer;
  try {
    docxBuffer = await gerarDocumentoOficial({
      titulo: politica.titulo,
      codigo: politica.codigo,
      publicadaEm: agora,
      areaNome: politica.area.nome,
      revisao: novaRevisao,
      secoes: snapshot.map((s) => ({ codigo: s.codigo, titulo: s.titulo, corpo: corpoParaTexto(s) })),
    });
  } catch (erro) {
    console.error("Falha ao gerar o documento oficial (.docx) — publicação bloqueada:", erro);
    return {
      ok: false,
      erro: "Falha ao gerar o documento oficial (.docx). Publicação cancelada — avise o suporte.",
    };
  }

  const nomeArquivo = `${politica.codigo ?? politica.titulo}.docx`;

  try {
    const salvo = await salvarArquivo(id, nomeArquivo, docxBuffer);

    await prisma.$transaction(async (tx) => {
      // Só a cadeia de documentos OFICIAIS tem substituição — anexo manual
      // nunca entra aqui (ver adicionarVersao, Task 5).
      await tx.versao.updateMany({
        where: { politicaId: id, estado: "ativa", documento: { oficial: true } },
        data: { estado: "substituida" },
      });
      const totais = await tx.versao.count({ where: { politicaId: id } });
      await tx.versao.create({
        data: {
          politicaId: id,
          numero: proximoNumeroVersao(totais),
          estado: "ativa",
          documento: {
            create: {
              nome: nomeArquivo,
              tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              tamanho: salvo.tamanho,
              hash: salvo.hash,
              estado: "importado",
              oficial: true,
            },
          },
        },
      });
      await tx.politica.update({
        where: { id },
        data: {
          estado: t.estado,
          publicadaEm: agora,
          publicadaPorNome: usuario!.nome,
          publicadaPorEmail: usuario!.email,
          conteudoPublicado: snapshot as never,
          revogadaEm: null,
          revisao: novaRevisao,
        },
      });
    });
  } catch (erro) {
    console.error("Falha ao salvar o documento oficial — publicação cancelada:", erro);
    return { ok: false, erro: "Falha ao salvar o documento oficial. Publicação cancelada — tente novamente." };
  }

  await registrar("politica.publicar", "Politica", id, politica.titulo);

  // Nunca deixar a notificação falhar a publicação: ela já está confirmada.
  try {
    await notificarAudiencia(id, politica.titulo);
  } catch (erro) {
    console.error("Notificação de publicação falhou (publicação já confirmada):", erro);
  }

  revalidatePath(`/catalogo/${id}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Rodar a suíte inteira + tsc + lint**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

Expected: tudo limpo.

- [ ] **Step 6: Commit**

```bash
git add app/\(shell\)/catalogo/\[id\]/estado-actions.ts tests/estado-actions.test.ts
git commit -m "feat(docx): publicarPolitica gera o documento oficial (fail-closed)"
```

---

### Task 5: Upload manual vira "anexo" — sem substituição (`actions.ts`)

**Files:**
- Modify: `app/(shell)/catalogo/[id]/actions.ts:40-63`
- Test: `tests/actions-anexo.test.ts` (novo)

**Interfaces:**
- Consumes: `Documento.oficial` (Task 3).
- Produces: `adicionarVersao` não substitui mais nenhuma versão existente —
  dois uploads seguidos ficam ambos `ativa`, ambos `oficial: false`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `tests/actions-anexo.test.ts`, mesmo estilo de mock do Task 4:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/usuario", () => ({
  getUsuarioAtual: vi.fn(),
  podeEditarConteudo: vi.fn(),
}));

vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));

vi.mock("@/lib/storage", () => ({ salvarArquivo: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeEditarConteudo } from "@/lib/auth/usuario";
import { salvarArquivo } from "@/lib/storage";
import { adicionarVersao } from "@/app/(shell)/catalogo/[id]/actions";

const usuarioAtual = getUsuarioAtual as ReturnType<typeof vi.fn>;
const editarPermitido = podeEditarConteudo as ReturnType<typeof vi.fn>;
const salvar = salvarArquivo as ReturnType<typeof vi.fn>;
const findUnique = prisma.politica.findUnique as ReturnType<typeof vi.fn>;
const transacao = prisma.$transaction as ReturnType<typeof vi.fn>;

const versaoCreate = vi.fn();
const versaoUpdateMany = vi.fn();
const versaoCount = vi.fn();

function formDataCom(nome: string) {
  const fd = new FormData();
  fd.set("arquivo", new File(["conteudo"], nome, { type: "application/pdf" }));
  return fd;
}

describe("adicionarVersao — anexo manual não substitui nada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1" });
    editarPermitido.mockReturnValue(true);
    findUnique.mockResolvedValue({ id: "p1" });
    salvar.mockResolvedValue({ hash: "h1", tamanho: 10, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    transacao.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount } });
    });
  });

  it("não chama updateMany (não marca nada como substituída)", async () => {
    await adicionarVersao("p1", formDataCom("planilha-reembolso.xlsx"));
    expect(versaoUpdateMany).not.toHaveBeenCalled();
  });

  it("cria o documento com oficial: false", async () => {
    await adicionarVersao("p1", formDataCom("planilha-reembolso.xlsx"));
    expect(versaoCreate).toHaveBeenCalledTimes(1);
    expect(versaoCreate.mock.calls[0][0].data.documento.create.oficial).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/actions-anexo.test.ts`
Expected: FAIL — `updateMany` ainda é chamado hoje (comportamento antigo).

- [ ] **Step 3: Editar `adicionarVersao` em `actions.ts`**

Trocar o bloco da transação (linhas 40-63 hoje) por:

```ts
    await prisma.$transaction(async (tx) => {
      const totais = await tx.versao.count({ where: { politicaId } });
      // Anexo manual (planilha, formulário de apoio) NÃO substitui nada —
      // múltiplos anexos convivem. Só o documento oficial (gerado
      // automaticamente na publicação) usa "substituida" — ver
      // publicarPolitica em estado-actions.ts.
      await tx.versao.create({
        data: {
          politicaId,
          numero: proximoNumeroVersao(totais),
          estado: "ativa",
          documento: {
            create: {
              nome: arquivo.name,
              tipo: arquivo.type || ext.replace(".", ""),
              tamanho: salvo.tamanho,
              hash: salvo.hash,
              estado: "importado",
              oficial: false,
            },
          },
        },
      });
    });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/actions-anexo.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Rodar a suíte inteira + tsc + lint**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
```

Expected: tudo limpo.

- [ ] **Step 6: Commit**

```bash
git add app/\(shell\)/catalogo/\[id\]/actions.ts tests/actions-anexo.test.ts
git commit -m "fix(anexo): upload manual convive com outros, nao substitui mais"
```

---

### Task 6: UI — badge "Documento oficial" vs "Anexo"

**Files:**
- Modify: `app/(shell)/catalogo/[id]/page.tsx:286`

**Interfaces:**
- Consumes: `v.documento.oficial` (já vem no include existente, Task 3
  adiciona o campo ao Prisma Client — nenhuma mudança de query necessária).

- [ ] **Step 1: Editar a célula "Documento" da tabela de Versões**

Trocar:

```tsx
                  <td className="px-4 py-2 text-black/70">{v.documento?.nome ?? "—"}</td>
```

Por:

```tsx
                  <td className="px-4 py-2 text-black/70">
                    {v.documento?.nome ?? "—"}
                    {v.documento && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          v.documento.oficial
                            ? "bg-marsala/10 text-marsala"
                            : "bg-black/5 text-black/60"
                        }`}
                      >
                        {v.documento.oficial ? "Documento oficial" : "Anexo"}
                      </span>
                    )}
                  </td>
```

- [ ] **Step 2: Verificar visualmente**

```bash
npx tsc --noEmit
```

Depois, com o dev server rodando (`npm run dev`) e `AUTH_PREVIEW_BYPASS=1`
temporariamente (reverter para `""` depois — nunca deixar ligado), abrir uma
política com versões e conferir o badge aparecendo ao lado do nome do
arquivo, nas duas cores (marsala para oficial, cinza para anexo). Publicar
uma política de teste ponta a ponta e confirmar que o `.docx` gerado aparece
na lista já com o badge "Documento oficial".

- [ ] **Step 3: Commit**

```bash
git add app/\(shell\)/catalogo/\[id\]/page.tsx
git commit -m "feat(ui): badge Documento oficial / Anexo na lista de Versoes"
```

---

### Task 7: Verificação final + PR

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte completa**

```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx vitest run
npm run build
```

Expected: tudo limpo, build do Next.js completo sem erros.

- [ ] **Step 2: Smoke test de publicação ponta a ponta**

Com Postgres local rodando (`docker compose up -d`) e `AUTH_PREVIEW_BYPASS=1`
temporário: criar uma política de teste com pelo menos 2 seções preenchidas,
publicar, baixar o `.docx` gerado pela tela ("Baixar" na versão marcada
"Documento oficial"), abrir no Word/LibreOffice e comparar visualmente o
cabeçalho/rodapé com o `modelo inicial.docx` original. Reverter
`AUTH_PREVIEW_BYPASS` para `""` depois.

- [ ] **Step 3: PR**

Branch a partir de `main` atualizado, PR com título
`feat(docx): gera documento oficial automaticamente na publicacao`,
descrição linkando a spec (`docs/superpowers/specs/2026-07-30-geracao-docx-oficial-design.md`)
e este plano. Aguardar aprovação + build policy verde antes de completar o
merge (mesmo fluxo já usado nas PRs #46-#50 desta sessão).
