# Controle de Revisões no Corpo do .docx Oficial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O `.docx` oficial gerado na publicação/republicação de uma política traz, como primeiro elemento do corpo (antes do capítulo 1), a tabela "Controle de Revisões" (Revisão | Data | Descrição da Alteração | Responsável) exigida pelo Manual (cap. 19), com uma linha por versão publicada.

**Architecture:** Dois campos novos em `Versao` guardam Descrição/Responsável por linha (imutáveis, uma vez criados). Uma função nova em `lib/politica/ai.ts` gera a descrição da republicação via IA (best-effort, fallback genérico). `publicarPolitica` busca as `Versao` anteriores, monta a lista completa de linhas, gera o `.docx` com ela (fail-closed, como hoje) e só depois persiste a nova `Versao` com os 2 campos já calculados. O template Word ganha uma tabela nova usando o mesmo mecanismo de loop (`{FOR x IN lista}...{END-FOR x}`) já usado pela lista de seções.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, `docx-templates`, Vitest.

## Global Constraints

- Vale para os 8 tipos de documento do sistema (mesmo gerador) — não é específico de Política.
- `descricaoAlteracao`/`responsavelNome` são imutáveis uma vez criados (nunca editados depois).
- Falha ao gerar a DESCRIÇÃO via IA nunca bloqueia a publicação (best-effort, fallback `` `Republicação — revisão ${NN}` ``). Falha ao gerar o `.docx` inteiro CONTINUA bloqueando (fail-closed, comportamento já existente, não muda).
- Revisão inicial (`novaRevisao === 0`) usa sempre o texto fixo `"Emissão inicial do documento"`, sem chamar IA.
- Linhas antigas de `Versao` que não têm os campos novos (criadas antes desta feature) mostram `"—"` no lugar, nunca erro/crash.

---

### Task 1: Schema — campos novos em `Versao`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

**Interfaces:**
- Produces: `Versao.descricaoAlteracao` (`String?`) e `Versao.responsavelNome` (`String?`) — consumidos pela Task 4.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, no `model Versao`, adicione os 2 campos logo depois de `revisaoNaEpoca`:

```prisma
model Versao {
  id         String       @id @default(cuid())
  politica   Politica     @relation(fields: [politicaId], references: [id])
  politicaId String
  numero     Int
  estado     EstadoVersao @default(ativa)
  documento  Documento?
  conteudoSnapshot Json?
  revisaoNaEpoca   Int?
  // Tabela de Controle de Revisões (Manual, cap. 19) — imutáveis uma vez
  // criados, uma linha por versão. Null em versões anteriores a esta
  // feature (mesmo padrão de conteudoSnapshot/revisaoNaEpoca) — a
  // renderização mostra "—" nessas linhas em vez de inventar dado.
  descricaoAlteracao String?
  responsavelNome    String?
  criadaEm   DateTime     @default(now())

  @@unique([politicaId, numero])
}
```

(Só os 2 campos novos são adição — o resto do model já existe, não remova nada.)

- [ ] **Step 2: Gerar e aplicar a migration**

Run: `npx prisma migrate dev --name controle_revisoes_versao`
Expected: migration criada em `prisma/migrations/`, aplicada sem erro (campos `String?` são sempre aditivos-seguros, sem precisar de default).

- [ ] **Step 3: Rodar a suíte inteira pra confirmar que nada quebrou**

Run: `npx vitest run`
Expected: PASS — nenhum teste depende ainda destes campos.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: campos descricaoAlteracao e responsavelNome em Versao (Controle de Revisões)"
```

---

### Task 2: `gerarDescricaoRevisao` em `lib/politica/ai.ts`

**Files:**
- Modify: `lib/politica/ai.ts`
- Create: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `iaDisponivel()`, `ENDPOINT`, `KEY`, `DEPLOYMENT`, `API_VERSION` (consts de módulo já existentes no topo do arquivo, usadas por `gerarRascunhoNorma`).
- Produces: `type SecaoSnapshot = { codigo: string; titulo: string; corpo?: string; linhas?: string[][] }` e `gerarDescricaoRevisao(secoesAnteriores: SecaoSnapshot[], secoesAtuais: SecaoSnapshot[]): Promise<string | null>` — consumidos pela Task 4. Retorna `null` (nunca lança) em qualquer cenário de falha — quem chama decide o texto de fallback, porque esta função não sabe o número da revisão.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/ai.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SECOES_ANTES = [{ codigo: "4", titulo: "Diretrizes", corpo: "Texto antigo." }];
const SECOES_DEPOIS = [{ codigo: "4", titulo: "Diretrizes", corpo: "Texto novo, com mais detalhe." }];

describe("gerarDescricaoRevisao", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("IA não configurada (sem endpoint/key): retorna null sem chamar fetch", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "");
    vi.stubEnv("AZURE_OPENAI_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IA disponível e responde com texto: retorna o texto (trim aplicado)", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  Revisão do item 4.  " } }] }),
    }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBe("Revisão do item 4.");
  });

  it("fetch rejeita (erro de rede): retorna null", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
  });

  it("resposta HTTP não-ok: retorna null", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "erro" }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
  });

  it("resposta vazia/só espaço: retorna null", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "   " } }] }),
    }));
    const { gerarDescricaoRevisao } = await import("@/lib/politica/ai");

    const resultado = await gerarDescricaoRevisao(SECOES_ANTES, SECOES_DEPOIS);

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL — `gerarDescricaoRevisao` não existe em `@/lib/politica/ai`.

- [ ] **Step 3: Implementar a função**

Em `lib/politica/ai.ts`, adicione ao final do arquivo (depois de `gerarRascunhoNorma`, reaproveitando os consts `ENDPOINT`/`KEY`/`DEPLOYMENT`/`API_VERSION`/`iaDisponivel` já definidos no topo do arquivo):

```ts
export type SecaoSnapshot = { codigo: string; titulo: string; corpo?: string; linhas?: string[][] };

// Resumo de 1 frase do que mudou entre duas versões da política, pra
// alimentar a linha nova da tabela de Controle de Revisões (Manual, cap.
// 19). Best-effort: qualquer falha (IA indisponível, chamada falha,
// resposta vazia) retorna null — quem chama decide o texto de fallback,
// porque esta função não sabe o número da revisão em questão.
export async function gerarDescricaoRevisao(
  secoesAnteriores: SecaoSnapshot[],
  secoesAtuais: SecaoSnapshot[],
): Promise<string | null> {
  if (!iaDisponivel()) return null;

  const formatar = (secoes: SecaoSnapshot[]) =>
    secoes
      .map((s) => `${s.codigo} ${s.titulo}: ${s.corpo ?? (s.linhas ?? []).map((l) => l.join(" | ")).join("; ")}`)
      .join("\n");

  const system = [
    "Você é redator normativo sênior da AAHBRANT Engenharia & Construções.",
    "Compare a versão ANTERIOR e a versão ATUAL de uma norma interna e descreva, em UMA frase curta e objetiva, o que mudou.",
    "Estilo dos exemplos do Manual de Padronização Documental: 'Inclusão do item 4.2', 'Revisão da seção de Responsabilidades'.",
    "Responda SOMENTE com a frase — sem aspas, sem pontuação final além de ponto, sem preâmbulo.",
  ].join("\n");

  const user = ["VERSÃO ANTERIOR:", formatar(secoesAnteriores), "", "VERSÃO ATUAL:", formatar(secoesAtuais)].join("\n");

  try {
    const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": KEY },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: 100,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const texto = (data?.choices?.[0]?.message?.content ?? "").trim();
    return texto.length > 0 ? texto : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/ai.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/politica/ai.ts tests/ai.test.ts
git commit -m "feat: gerarDescricaoRevisao resume o que mudou entre duas versoes via IA (best-effort)"
```

---

### Task 3: Tabela "Controle de Revisões" no template + `gerarDocx.ts`

**Files:**
- Modify: `lib/politica/gerarDocx.ts`
- Modify: `templates/politica-modelo.docx` (binário — editado via unzip/zip do XML interno)
- Modify: `tests/gerarDocx.test.ts`

**Interfaces:**
- Produces: `DadosDocumentoOficial.controleRevisoes: Array<{ revisao: string; data: string; descricao: string; responsavel: string }>` — consumido pela Task 4.

O template já usa o padrão `{FOR secao IN secoes}...{END-FOR secao}` do `docx-templates` pra repetir as seções (confirmado por inspeção do XML interno). A tabela nova replica o MESMO mecanismo, só que repetindo uma linha de TABELA em vez de parágrafos: o `docx-templates` repete o menor elemento em comum que contém tanto o `{FOR ...}` quanto o `{END-FOR ...}` — se `{FOR rev IN controleRevisoes}` está na primeira célula de uma linha e `{END-FOR rev}` está na última célula da MESMA linha, o elemento em comum é a própria `<w:tr>`, e essa linha é repetida uma vez por item da lista.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/gerarDocx.test.ts`, no teste `"preenche cabeçalho e seções no modelo real..."`, adicione o campo `controleRevisoes` na chamada e as asserções novas (mantenha todo o resto do teste igual):

```ts
describe("gerarDocumentoOficial", () => {
  it("preenche cabeçalho e seções no modelo real (templates/politica-modelo.docx)", async () => {
    const buffer = await gerarDocumentoOficial({
      titulo: "POLÍTICA DE TESTE AUTOMATIZADO",
      codigo: "AHBT-POL-TI-999",
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
      areaNome: "Tecnologia da Informação",
      revisao: 3,
      controleRevisoes: [
        { revisao: "00", data: "01/01/2026", descricao: "Emissão inicial do documento", responsavel: "Fulano" },
        { revisao: "01", data: "30/07/2026", descricao: "Inclusão do item 4.2", responsavel: "Beltrano" },
      ],
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

    // Tabela de Controle de Revisões: as duas linhas de dados aparecem, e
    // ANTES do conteúdo das seções (primeiro elemento do corpo — Manual cap. 19).
    expect(corpo).toContain("00");
    expect(corpo).toContain("Emissão inicial do documento");
    expect(corpo).toContain("Inclusão do item 4.2");
    expect(corpo).toContain("Beltrano");
    expect(corpo.indexOf("Emissão inicial do documento")).toBeLessThan(corpo.indexOf("1 · Objetivo"));

    expect(corpo).toContain("1 · Objetivo");
    expect(corpo).toContain("Texto de teste do objetivo.");
    expect(corpo).toContain("2 · Abrangência");
    expect(corpo).toContain("Texto de teste da abrangência.");
    // Sem sobra de sintaxe de template (loop malformado ou tag sem substituir).
    expect(corpo).not.toContain("{FOR");
    expect(corpo).not.toContain("{END-FOR");
  });

  it("propaga o erro se o template não existir (nunca engole)", async () => {
    const buffer = await gerarDocumentoOficial({
      titulo: "SEM SEÇÕES",
      codigo: null,
      publicadaEm: new Date("2026-07-30T12:00:00Z"),
      areaNome: "Qualidade",
      revisao: 0,
      controleRevisoes: [{ revisao: "00", data: "30/07/2026", descricao: "Emissão inicial do documento", responsavel: "Fulano" }],
      secoes: [],
    });
    expect(buffer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/gerarDocx.test.ts`
Expected: FAIL — `controleRevisoes` não existe no tipo `DadosDocumentoOficial`, e mesmo ignorando o tipo, o template ainda não tem a tabela (as asserções de conteúdo não encontram as strings).

- [ ] **Step 3: Adicionar o campo em `gerarDocx.ts`**

Em `lib/politica/gerarDocx.ts`, adicione o campo ao tipo e passe pro `createReport`:

```ts
export type LinhaControleRevisoes = { revisao: string; data: string; descricao: string; responsavel: string };

export type DadosDocumentoOficial = {
  titulo: string;
  codigo: string | null;
  publicadaEm: Date;
  areaNome: string;
  revisao: number;
  controleRevisoes: LinhaControleRevisoes[];
  secoes: SecaoDocx[];
};
```

E no `data` passado a `createReport` (dentro de `gerarDocumentoOficial`), adicione a linha `controleRevisoes: dados.controleRevisoes,` junto das demais (mesmo padrão de `secoes: dados.secoes`).

- [ ] **Step 4: Editar o template Word — adicionar a tabela**

Use a skill `docx` (fluxo "Editing existing documents") pra este passo. Crie um
diretório de trabalho temporário (qualquer local gravável — ex.:
`WORKDIR=$(mktemp -d)`) e desempacote lá:

```bash
WORKDIR=$(mktemp -d)
unzip -q templates/politica-modelo.docx -d "$WORKDIR/modelo-unpack"
```

Abra `$WORKDIR/modelo-unpack/word/document.xml` e localize a string literal
`{FOR secao IN secoes}` (ela aparece dentro de um `<w:t xml:space="preserve">` num parágrafo, logo após o parágrafo vazio inicial do `<w:body>`). Insira a tabela abaixo IMEDIATAMENTE ANTES do `<w:p>` que contém esse texto (ou seja, entre o parágrafo vazio inicial e o parágrafo do `{FOR secao IN secoes}`):

```xml
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="1500"/><w:gridCol w:w="1800"/><w:gridCol w:w="4500"/><w:gridCol w:w="2200"/>
  </w:tblGrid>
  <!-- Cabeçalho: negrito + Arial + marsala institucional #670000.
       Ordem canônica dentro de <w:rPr>: rFonts -> b -> color. -->
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="670000"/></w:rPr><w:t>Revisão</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="670000"/></w:rPr><w:t>Data</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="670000"/></w:rPr><w:t>Descrição da Alteração</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="670000"/></w:rPr><w:t>Responsável</w:t></w:r></w:p></w:tc>
  </w:tr>
  <!-- Linha só com o {FOR} — consumida na renderização. -->
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">{FOR rev IN controleRevisoes}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p/></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p/></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p/></w:tc>
  </w:tr>
  <!-- Linha de dados — esta é a que se repete, uma vez por item. -->
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{$rev.revisao}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{$rev.data}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{$rev.descricao}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{$rev.responsavel}</w:t></w:r></w:p></w:tc>
  </w:tr>
  <!-- Linha só com o {END-FOR} — consumida na renderização. -->
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">{END-FOR rev}</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p/></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p/></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p/></w:tc>
  </w:tr>
</w:tbl>
```

Pontos de atenção:

- **`{FOR rev IN controleRevisoes}` e `{END-FOR rev}` ficam em LINHAS PRÓPRIAS da tabela**, com a linha de dados entre elas. É esse o padrão que faz o `docx-templates` repetir a `<w:tr>` de dados. As linhas de comando são consumidas e removidas na renderização.
- **NÃO coloque `{FOR}` e `{END-FOR}` na MESMA linha.** Isso é um padrão diferente e documentado: gera **COLUNAS**, não linhas — o `docx-templates` repete os nós entre os dois comandos dentro do ancestral comum (as `<w:tc>`), produzindo uma única linha com N×4 células e XML inválido (`<w:tcPr>` duplicado dentro do mesmo `<w:tc>`). Ver README do `docx-templates`, seção "`FOR` and `END-FOR`": o exemplo "`FOR` loops also work over table rows" usa linhas separadas; o exemplo seguinte, de gerar colunas dinamicamente, é o que usa a mesma linha. Erro confirmado empiricamente por render real na Task 3.
- Os placeholders de dado usam `{$rev.campo}` (com `$`, não `{rev.campo}` sem `$` — confirme comparando com `{$secao.codigo}` já usado no arquivo).
- Um teste que só verifica TEXTO (`toContain`) **passa mesmo com o layout quebrado** — as duas variantes contêm as mesmas strings. Por isso o teste inclui asserções estruturais sobre o número de `<w:tr>`/`<w:tc>` da tabela renderizada.

Rezipar:

```bash
(cd "$WORKDIR/modelo-unpack" && rm -f "$WORKDIR/modelo-novo.docx" && zip -Xr "$WORKDIR/modelo-novo.docx" .)
cp "$WORKDIR/modelo-novo.docx" templates/politica-modelo.docx
```

- [ ] **Step 5: Validar o XML e renderizar visualmente**

Invoque a skill `docx` pela ferramenta `Skill` (ela reporta o "Base directory" dela na resposta) e rode, a partir desse diretório base:

```bash
python <base-directory-da-skill-docx>/scripts/office/validate.py templates/politica-modelo.docx
```
Expected: sem erro de XSD.

Depois, rode o teste (Step 6) — ele já faz um render real via `docx-templates` contra o template editado, então qualquer problema estrutural aparece como falha de teste, não precisa de um render manual separado pra este task.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/gerarDocx.test.ts`
Expected: PASS (2 testes)

Se falhar com erro de template (não com falha de asserção), abra o buffer gerado, salve como `.docx` temporário, converta com `soffice --headless --convert-to pdf` e `pdftoppm -jpeg -r 100`, e leia a imagem pra diagnosticar visualmente antes de tentar de novo — não adivinhe pela mensagem de erro do `docx-templates` sozinha.

- [ ] **Step 7: Commit**

```bash
git add lib/politica/gerarDocx.ts templates/politica-modelo.docx tests/gerarDocx.test.ts
git commit -m "feat: tabela de Controle de Revisoes no corpo do .docx oficial (template + gerarDocx)"
```

---

### Task 4: Integração em `publicarPolitica`

**Files:**
- Modify: `app/(shell)/catalogo/[id]/estado-actions.ts:132-252` (função `publicarPolitica`)
- Modify: `tests/estado-actions.test.ts`

**Interfaces:**
- Consumes: `gerarDescricaoRevisao` e `type SecaoSnapshot` (Task 2, `@/lib/politica/ai`); `LinhaControleRevisoes` e o campo `controleRevisoes` de `DadosDocumentoOficial` (Task 3, `@/lib/politica/gerarDocx`); `Versao.descricaoAlteracao`/`responsavelNome` (Task 1).

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/estado-actions.test.ts`, adicione ao mock de `@/lib/prisma` (dentro do objeto `prisma` do `vi.mock`, linha 5-14) a entrada `versao: { findMany: vi.fn() },`:

```ts
vi.mock("@/lib/prisma", () => ({
  prisma: {
    politica: { findUnique: vi.fn(), update: vi.fn() },
    pendencia: { createMany: vi.fn(), updateMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    consorcio: { findUnique: vi.fn() },
    notificacao: { create: vi.fn() },
    versao: { findMany: vi.fn() }, // NOVO — busca de Versao anteriores pro Controle de Revisões
    $transaction: vi.fn(),
  },
}));
```

Adicione o mock de `@/lib/politica/ai` (novo bloco `vi.mock`, junto dos outros no topo do arquivo):

```ts
vi.mock("@/lib/politica/ai", () => ({ gerarDescricaoRevisao: vi.fn() }));
```

Adicione os imports e os consts extraídos correspondentes, junto dos já existentes (linhas 33-56):

```ts
import { gerarDescricaoRevisao } from "@/lib/politica/ai";
// ...
const versaoFindMany = prisma.versao.findMany as ReturnType<typeof vi.fn>;
const descricaoIA = gerarDescricaoRevisao as ReturnType<typeof vi.fn>;
```

No `beforeEach` do describe `"publicarPolitica — geração do documento oficial"` (linha 80-102), adicione um default pro novo mock (senão `versaoFindMany` retorna `undefined` e o `.map` no código novo lança):

```ts
beforeEach(() => {
  vi.clearAllMocks();
  usuarioAtual.mockResolvedValue({ id: "u1", nome: "Teste", email: "teste@aahbrant.com" });
  publicarPermitido.mockReturnValue(true);
  notificar.mockResolvedValue({ ok: true });
  salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
  versaoCount.mockResolvedValue(0);
  versaoFindMany.mockResolvedValue([]); // NOVO — sem versões anteriores por padrão
  usuarioFindMany.mockResolvedValue([]);
  transacao.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return (arg as (tx: unknown) => Promise<void>)({
      versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
      politica: { update: politicaUpdate },
    });
  });
});
```

Adicione um novo `describe`, depois do describe `"publicarPolitica — geração do documento oficial"` já existente (antes de `"publicarPolitica — cria Pendencia (best-effort)"`):

```ts
describe("publicarPolitica — Controle de Revisões", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioAtual.mockResolvedValue({ id: "u1", nome: "Fulano de Tal", email: "fulano@aahbrant.com" });
    publicarPermitido.mockReturnValue(true);
    notificar.mockResolvedValue({ ok: true });
    salvar.mockResolvedValue({ hash: "abc123", tamanho: 100, caminhoRelativo: "x" });
    versaoCount.mockResolvedValue(0);
    usuarioFindMany.mockResolvedValue([]);
    gerar.mockResolvedValue(Buffer.from("conteudo-fake"));
    transacao.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<void>)({
        versao: { create: versaoCreate, updateMany: versaoUpdateMany, count: versaoCount },
        politica: { update: politicaUpdate },
      });
    });
  });

  it("primeira publicação: 1 linha fixa 'Emissão inicial do documento', sem chamar a IA", async () => {
    findUnique.mockResolvedValue(politicaBase());
    versaoFindMany.mockResolvedValue([]);

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(descricaoIA).not.toHaveBeenCalled();
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes).toEqual([
      { revisao: "00", data: expect.any(String), descricao: "Emissão inicial do documento", responsavel: "Fulano de Tal" },
    ]);
    expect(versaoCreate.mock.calls[0][0].data.descricaoAlteracao).toBe("Emissão inicial do documento");
    expect(versaoCreate.mock.calls[0][0].data.responsavelNome).toBe("Fulano de Tal");
  });

  it("republicação: usa a descrição da IA e preserva as linhas anteriores", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 0,
      conteudoPublicado: [{ codigo: "1", titulo: "Objetivo", corpo: "Texto antigo." }],
    });
    versaoFindMany.mockResolvedValue([
      { revisaoNaEpoca: 0, criadaEm: new Date("2026-01-01T00:00:00.000Z"), descricaoAlteracao: "Emissão inicial do documento", responsavelNome: "Ciclano" },
    ]);
    descricaoIA.mockResolvedValue("Inclusão do item 4.2");

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    expect(descricaoIA).toHaveBeenCalledTimes(1);
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes).toEqual([
      { revisao: "00", data: "01/01/2026", descricao: "Emissão inicial do documento", responsavel: "Ciclano" },
      { revisao: "01", data: expect.any(String), descricao: "Inclusão do item 4.2", responsavel: "Fulano de Tal" },
    ]);
    expect(versaoCreate.mock.calls[0][0].data.descricaoAlteracao).toBe("Inclusão do item 4.2");
  });

  it("republicação com IA indisponível/falha: usa o fallback genérico, não bloqueia a publicação", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 4,
      conteudoPublicado: [],
    });
    versaoFindMany.mockResolvedValue([]);
    descricaoIA.mockResolvedValue(null);

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes[0].descricao).toBe("Republicação — revisão 05");
  });

  it("versão anterior sem descricaoAlteracao/responsavelNome (dado antigo, pré-feature): mostra '—'", async () => {
    findUnique.mockResolvedValue({
      ...politicaBase(),
      estado: "rascunho",
      publicadaEm: new Date("2026-01-01T00:00:00.000Z"),
      revisao: 0,
      conteudoPublicado: [],
    });
    versaoFindMany.mockResolvedValue([
      { revisaoNaEpoca: 0, criadaEm: new Date("2026-01-01T00:00:00.000Z"), descricaoAlteracao: null, responsavelNome: null },
    ]);
    descricaoIA.mockResolvedValue("Inclusão do item 4.2");

    const resultado = await publicarPolitica("p1");

    expect(resultado.ok).toBe(true);
    const dadosDocx = gerar.mock.calls[0][0];
    expect(dadosDocx.controleRevisoes[0]).toEqual({ revisao: "00", data: "01/01/2026", descricao: "—", responsavel: "—" });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: FAIL — `publicarPolitica` ainda não chama `prisma.versao.findMany` nem `gerarDescricaoRevisao`, e `gerarDocumentoOficial` ainda não recebe `controleRevisoes`.

- [ ] **Step 3: Implementar em `publicarPolitica`**

No topo de `app/(shell)/catalogo/[id]/estado-actions.ts`, adicione o import:

```ts
import { gerarDescricaoRevisao } from "@/lib/politica/ai";
```

Dentro de `publicarPolitica`, substitua o trecho atual (do `const snapshot = montarSnapshot(...)` até o fechamento do `try` que gera `docxBuffer`) por:

```ts
  const snapshot = montarSnapshot(politica.secoes);
  const novaRevisao = politica.publicadaEm ? politica.revisao + 1 : politica.revisao;
  const agora = new Date();

  // Controle de Revisões (Manual, cap. 19): busca as versões anteriores
  // ANTES de gerar o .docx, pra montar a lista completa (antigas + a nova)
  // e imprimir tudo de uma vez — nunca depois, senão o documento gerado
  // divergiria do que fica persistido.
  const versoesAnteriores = await prisma.versao.findMany({
    where: { politicaId: id },
    orderBy: { numero: "asc" },
    select: { revisaoNaEpoca: true, criadaEm: true, descricaoAlteracao: true, responsavelNome: true },
  });
  const linhasAnteriores = versoesAnteriores.map((v) => ({
    revisao: v.revisaoNaEpoca != null ? String(v.revisaoNaEpoca).padStart(2, "0") : "—",
    data: v.criadaEm.toLocaleDateString("pt-BR"),
    descricao: v.descricaoAlteracao ?? "—",
    responsavel: v.responsavelNome ?? "—",
  }));

  let descricaoNovaVersao: string;
  if (!politica.publicadaEm) {
    descricaoNovaVersao = "Emissão inicial do documento";
  } else {
    const secoesAtuais = snapshot.map((s) => ({ codigo: s.codigo, titulo: s.titulo, corpo: corpoParaTexto(s) }));
    const secoesAnteriores = Array.isArray(politica.conteudoPublicado)
      ? (politica.conteudoPublicado as Array<{ codigo: string; titulo: string; corpo?: string; linhas?: string[][] }>)
      : [];
    const descricaoIA = await gerarDescricaoRevisao(secoesAnteriores, secoesAtuais);
    descricaoNovaVersao = descricaoIA ?? `Republicação — revisão ${String(novaRevisao).padStart(2, "0")}`;
  }

  const controleRevisoes = [
    ...linhasAnteriores,
    {
      revisao: String(novaRevisao).padStart(2, "0"),
      data: agora.toLocaleDateString("pt-BR"),
      descricao: descricaoNovaVersao,
      responsavel: usuario!.nome,
    },
  ];

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
      controleRevisoes,
      secoes: snapshot.map((s) => ({ codigo: s.codigo, titulo: s.titulo, corpo: corpoParaTexto(s) })),
    });
  } catch (erro) {
    console.error("Falha ao gerar o documento oficial (.docx) — publicação bloqueada:", erro);
    return {
      ok: false,
      erro: "Falha ao gerar o documento oficial (.docx). Publicação cancelada — avise o suporte.",
    };
  }
```

E dentro da transação (`await prisma.$transaction(async (tx) => {...})`, no `tx.versao.create`), adicione os 2 campos novos ao `data`:

```ts
      await tx.versao.create({
        data: {
          politicaId: id,
          numero: proximoNumeroVersao(totais),
          estado: "ativa",
          conteudoSnapshot: snapshot as never,
          revisaoNaEpoca: novaRevisao,
          descricaoAlteracao: descricaoNovaVersao,
          responsavelNome: usuario!.nome,
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
```

(O resto da função — `salvarArquivo`, o resto da transação, `registrar`, pendências, notificação, `revalidatePath` — não muda.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: PASS (todos os testes existentes + os 4 novos de Controle de Revisões)

- [ ] **Step 5: Rodar a suíte inteira, typecheck e lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: tudo limpo.

- [ ] **Step 6: Commit**

```bash
git add "app/(shell)/catalogo/[id]/estado-actions.ts" tests/estado-actions.test.ts
git commit -m "feat: publicarPolitica monta e persiste o Controle de Revisoes completo"
```

---

### Task 5: Verificação final

**Files:** nenhum arquivo novo — só validação.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS, todos os testes (incluindo os das Tasks 1-4).

- [ ] **Step 2: Rodar lint e typecheck**

Run: `npx eslint . --max-warnings=0 && npx tsc --noEmit`
Expected: sem erros/warnings.

- [ ] **Step 3: Render manual do template pra confirmar visualmente**

```bash
WORKDIR=$(mktemp -d)
node -e "
const { gerarDocumentoOficial } = require('./lib/politica/gerarDocx');
gerarDocumentoOficial({
  titulo: 'POLÍTICA DE VERIFICAÇÃO FINAL', codigo: 'AHBT-POL-TI-000', publicadaEm: new Date(),
  areaNome: 'TI', revisao: 1,
  controleRevisoes: [
    { revisao: '00', data: '01/01/2026', descricao: 'Emissão inicial do documento', responsavel: 'Fulano' },
    { revisao: '01', data: '30/07/2026', descricao: 'Inclusão do item 4.2', responsavel: 'Beltrano' },
  ],
  secoes: [{ codigo: '1', titulo: 'Objetivo', corpo: 'Texto de verificação.' }],
}).then(buf => require('fs').writeFileSync(process.env.WORKDIR + '/verificacao.docx', buf));
"
python <base-directory-da-skill-docx>/scripts/office/soffice.py --headless --convert-to pdf "$WORKDIR/verificacao.docx" --outdir "$WORKDIR"
pdftoppm -jpeg -r 100 "$WORKDIR/verificacao.pdf" "$WORKDIR/pagina"
```

Leia `$WORKDIR/pagina-1.jpg` (ferramenta Read) e confirme visualmente: a tabela de Controle de Revisões aparece ANTES de "1 Objetivo", com cabeçalho em negrito, 2 linhas de dado, sem colunas verticais internas (só bordas horizontais).

- [ ] **Step 4: Conferir escopo — nada fora do previsto foi tocado**

```bash
git diff main --stat
```

Expected: só os arquivos das Tasks 1-4 (`prisma/schema.prisma`, `prisma/migrations/...`, `lib/politica/ai.ts`, `tests/ai.test.ts`, `lib/politica/gerarDocx.ts`, `templates/politica-modelo.docx`, `tests/gerarDocx.test.ts`, `app/(shell)/catalogo/[id]/estado-actions.ts`, `tests/estado-actions.test.ts`).
