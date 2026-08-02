# Versão substituída vira "Ver" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando uma versão do documento oficial é substituída por uma republicação, o botão
"Baixar" dessa versão vira "Ver" (mostra o conteúdo na tela, sem servir o arquivo) — só a versão
ativa continua baixável.

**Architecture:** `Versao` passa a guardar seu próprio snapshot de conteúdo (`conteudoSnapshot` +
`revisaoNaEpoca`), gravado no momento da criação (dentro da mesma transação de
`publicarPolitica`). A renderização read-only de seções (hoje só dentro de `CienciaLeitura.tsx`)
é extraída para um componente compartilhado `DocumentoRenderizado`, reaproveitado por um novo
componente `VerVersaoAntiga` (modal, sem download) e pelo próprio `CienciaLeitura` (sem mudança
visual). A tabela de Versões decide Baixar/Ver/nada por linha, conforme o estado e a presença do
snapshot.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, Vitest.

## Global Constraints

- Regra vale só pro documento OFICIAL (`Documento.oficial === true`). Anexo manual sempre
  "Baixar", qualquer estado.
- Versão `ativa` sempre "Baixar" (comportamento atual, sem mudança).
- Versão `substituida` com `conteudoSnapshot` preenchido → "Ver" (modal read-only, zero acesso a
  arquivo).
- Versão `substituida` SEM `conteudoSnapshot` (legada, anterior a esta feature) → nenhum botão.
- Migration aditiva — sem impacto em dado existente.

---

### Task 1: Modelo de dados — Versao ganha snapshot próprio

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration em `prisma/migrations/` (via `npx prisma migrate dev`)

**Interfaces:**
- Produces: `Versao.conteudoSnapshot: Json | null`, `Versao.revisaoNaEpoca: Int | null`.

- [ ] **Step 1: Adicionar os 2 campos ao model `Versao` em `prisma/schema.prisma`**

O model atual (linhas 246-256):

```prisma
model Versao {
  id         String       @id @default(cuid())
  politica   Politica     @relation(fields: [politicaId], references: [id])
  politicaId String
  numero     Int
  estado     EstadoVersao @default(ativa)
  documento  Documento?
  criadaEm   DateTime     @default(now())

  @@unique([politicaId, numero])
}
```

Vira:

```prisma
model Versao {
  id               String       @id @default(cuid())
  politica         Politica     @relation(fields: [politicaId], references: [id])
  politicaId       String
  numero           Int
  estado           EstadoVersao @default(ativa)
  documento        Documento?
  // Snapshot do conteúdo (mesmo formato de Politica.conteudoPublicado) no
  // momento em que ESTA versão foi criada — nunca mais sobrescrito depois,
  // diferente do campo em Politica. Null em versões anteriores a esta
  // feature (não há como recuperar o histórico exato sem abrir o .docx
  // antigo — ver docs/superpowers/specs/2026-08-02-versao-substituida-ver-nao-baixar-design.md).
  conteudoSnapshot Json?
  // Politica.revisao válido no momento em que esta versão foi criada — usado
  // no cabeçalho institucional ao "Ver" uma versão antiga (o número de
  // revisão atual da política pode já ter mudado).
  revisaoNaEpoca   Int?
  criadaEm         DateTime     @default(now())

  @@unique([politicaId, numero])
}
```

- [ ] **Step 2: Gerar a migration**

Run: `npx prisma migrate dev --name versao_snapshot`
Expected: cria `prisma/migrations/<timestamp>_versao_snapshot/migration.sql` (`ALTER TABLE
"Versao" ADD COLUMN "conteudoSnapshot" JSONB, ADD COLUMN "revisaoNaEpoca" INTEGER`), aplica no
banco local, roda `prisma generate`.

- [ ] **Step 3: Verificar que o client gerado compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): Versao ganha conteudoSnapshot + revisaoNaEpoca"
```

---

### Task 2: publicarPolitica grava o snapshot na nova versão

**Files:**
- Modify: `app/(shell)/catalogo/[id]/estado-actions.ts`
- Test: `tests/estado-actions.test.ts`

**Interfaces:**
- Consumes: `Versao.conteudoSnapshot`, `Versao.revisaoNaEpoca` (Task 1).
- Produces: nenhuma interface nova — só passa a preencher 2 campos que já existem no `data` do
  `tx.versao.create`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `tests/estado-actions.test.ts`, dentro de
`describe("publicarPolitica — geração do documento oficial", ...)`, logo após o teste
"gera o .docx, salva e publica quando a geração funciona" (por volta da linha 120):

```ts
it("grava conteudoSnapshot e revisaoNaEpoca na nova versão", async () => {
  findUnique.mockResolvedValue(politicaBase());
  gerar.mockResolvedValue(Buffer.from("conteudo-fake"));

  const resultado = await publicarPolitica("p1");

  expect(resultado.ok).toBe(true);
  const dataVersao = versaoCreate.mock.calls[0][0].data;
  expect(dataVersao.conteudoSnapshot).toEqual(politicaBase().secoes.map((s) => ({
    codigo: s.codigo,
    titulo: s.titulo,
    tipo: s.tipo,
    corpo: s.corpo,
    colunas: s.colunas ?? null,
    linhas: s.linhas ?? null,
  })));
  expect(dataVersao.revisaoNaEpoca).toBe(0); // politicaBase().revisao = 0, publicadaEm = null → novaRevisao = revisao (0)
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: FAIL — `dataVersao.conteudoSnapshot` é `undefined`.

- [ ] **Step 3: Implementar em `app/(shell)/catalogo/[id]/estado-actions.ts`**

O bloco `tx.versao.create` (linhas 185-201 do arquivo atual):

```ts
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
```

Vira (adiciona `conteudoSnapshot` e `revisaoNaEpoca`, usando o `snapshot`/`novaRevisao` já
calculados no topo da função):

```ts
      await tx.versao.create({
        data: {
          politicaId: id,
          numero: proximoNumeroVersao(totais),
          estado: "ativa",
          conteudoSnapshot: snapshot as never,
          revisaoNaEpoca: novaRevisao,
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

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/estado-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira e tsc**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros, todos os testes passam (sem regressão nos outros testes de
`publicarPolitica`, que não checam esses 2 campos e continuam batendo normalmente).

- [ ] **Step 6: Commit**

```bash
git add "app/(shell)/catalogo/[id]/estado-actions.ts" tests/estado-actions.test.ts
git commit -m "feat(publicacao): grava snapshot de conteudo por versao"
```

---

### Task 3: Extrair DocumentoRenderizado de CienciaLeitura

**Files:**
- Create: `components/politica/DocumentoRenderizado.tsx`
- Modify: `components/politica/CienciaLeitura.tsx`

**Interfaces:**
- Produces: `<DocumentoRenderizado secoes consorcio={...} tituloPolitica areaNome codigo
  publicadaEm revisao onScroll? scrollRef? />` — componente puramente apresentacional (sem
  lógica de ciência/confirmação), devolve o cabeçalho institucional + seções + rodapé.
- Consumes (Task 4/5): nada ainda; este task só prepara a extração.

- [ ] **Step 1: Criar `components/politica/DocumentoRenderizado.tsx`**

Extrai literalmente o cabeçalho (tabela institucional), o bloco de seções e o rodapé de
`CienciaLeitura.tsx` (linhas 116-199 do arquivo atual), adicionando `onScroll`/`scrollRef`
opcionais no container rolável (pra `CienciaLeitura` continuar controlando sua trava de rolagem;
quem não passar esses props simplesmente não tem scroll-gate):

```tsx
import Brand from "@/components/shell/Brand";

export type SecaoRenderizada = {
  codigo: string;
  titulo: string;
  tipo: string;
  corpo: string;
  colunas: string[] | null;
  linhas: string[][] | null;
};

// Cabeçalho/rodapé institucional (Manual de Padronização Documental, cap.
// 11-12) — mesmo modelo de todo documento oficial da AAHBRANT. Puramente
// apresentacional: nenhuma lógica de ciência, confirmação ou permissão vive
// aqui — reaproveitado por CienciaLeitura (leitura da versão publicada) e
// VerVersaoAntiga (leitura de versão substituída).
export default function DocumentoRenderizado({
  secoes,
  tituloPolitica,
  areaNome,
  codigo,
  publicadaEm,
  revisao,
  onScroll,
  scrollRef,
}: {
  secoes: SecaoRenderizada[];
  tituloPolitica: string;
  areaNome: string;
  codigo: string | null;
  publicadaEm: Date | null;
  revisao: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <table className="w-full table-fixed border-collapse border border-black/40 text-[9px] text-black">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[22%] border border-black/40 px-2 py-1.5 align-middle">
              <Brand somenteLogo />
            </td>
            <td rowSpan={2} className="w-[48%] border border-black/40 px-2 py-1.5 text-center align-middle">
              <span className="font-bold uppercase leading-tight">{tituloPolitica}</span>
            </td>
            <td className="border border-black/40 px-2 py-1">
              <strong>Código:</strong> {codigo ?? "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-black/40 px-2 py-1">
              <strong>Data:</strong> {publicadaEm ? publicadaEm.toLocaleDateString("pt-BR") : "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-black/40 px-2 py-1">
              <strong>Unidade:</strong>
            </td>
            <td className="border border-black/40 px-2 py-1">
              <strong>Área Responsável:</strong> {areaNome}
            </td>
            <td className="border border-black/40 px-2 py-1">
              <strong>Revisão:</strong> {String(revisao).padStart(2, "0")}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-black/80"
      >
        {secoes.length === 0 ? (
          <p className="text-black/50">Documento sem conteúdo estruturado.</p>
        ) : (
          secoes.map((s) => (
            <div key={s.codigo}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-marsala">
                {s.codigo} · {s.titulo}
              </h4>
              {s.tipo === "tabela" ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    {s.colunas && s.colunas.length > 0 && (
                      <thead>
                        <tr>
                          {s.colunas.map((c, i) => (
                            <th key={i} className="border border-black/10 bg-black/5 px-2 py-1 text-left font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {(s.linhas ?? []).map((linha, i) => (
                        <tr key={i}>
                          {linha.map((cel, j) => (
                            <td key={j} className="border border-black/10 px-2 py-1">{cel}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{s.corpo || "—"}</p>
              )}
            </div>
          ))
        )}

        <div className="pt-2 text-center text-[9px] font-bold leading-tight text-black">
          <p>Propriedade da</p>
          <p>AAHBRANT ENGENHARIA E CONSTRUÇÕES</p>
          <p>uso exclusivamente interno</p>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Atualizar `CienciaLeitura.tsx` para usar `DocumentoRenderizado`**

Remover o `type SecaoLeitura` local (linhas 9-16) e importar `SecaoRenderizada` de
`DocumentoRenderizado` no lugar (usar como tipo do prop `secoes`). Substituir o bloco inteiro do
cabeçalho + seções + rodapé (linhas 116-199, dentro do card do modal) por:

```tsx
            <DocumentoRenderizado
              secoes={secoes}
              tituloPolitica={tituloPolitica}
              areaNome={areaNome}
              codigo={codigo}
              publicadaEm={publicadaEm}
              revisao={revisao}
              onScroll={(e) => checarFim(e.currentTarget)}
              scrollRef={aoMontarArea}
            />
```

Manter tudo em volta igual (o `<button>` de abrir, o `<div className="fixed inset-0 ...">`, a
barra de ações "Fechar"/"Confirmar ciência" no rodapé do modal, a mensagem de erro) — só o miolo
(cabeçalho+seções+rodapé) é substituído pelo componente novo. Adicionar o import:

```ts
import DocumentoRenderizado, { type SecaoRenderizada } from "@/components/politica/DocumentoRenderizado";
```

E trocar a prop `secoes: SecaoLeitura[]` da assinatura do componente pra `secoes:
SecaoRenderizada[]`.

- [ ] **Step 3: Verificar tipos e rodar a suíte inteira**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros, todos os testes passam (extração pura, sem mudança de comportamento —
nenhum teste deveria quebrar).

- [ ] **Step 4: Verificação visual manual**

Abrir uma política publicada no navegador, clicar em "Li e estou ciente" (ou "Ver conteúdo" se já
deu ciência) e confirmar que o modal renderiza exatamente igual a antes (cabeçalho, seções,
rodapé, trava de rolagem funcionando).

- [ ] **Step 5: Commit**

```bash
git add components/politica/DocumentoRenderizado.tsx components/politica/CienciaLeitura.tsx
git commit -m "refactor(ciencia): extrai DocumentoRenderizado de CienciaLeitura (sem mudanca visual)"
```

---

### Task 4: Componente VerVersaoAntiga

**Files:**
- Create: `components/politica/VerVersaoAntiga.tsx`

**Interfaces:**
- Consumes: `DocumentoRenderizado`, `SecaoRenderizada` (Task 3).
- Produces: `<VerVersaoAntiga secoes tituloPolitica areaNome codigo publicadaEm revisao />`
  (default export) — botão "Ver" que abre modal read-only, sem nenhuma chamada de rede/arquivo.

- [ ] **Step 1: Criar `components/politica/VerVersaoAntiga.tsx`**

```tsx
"use client";

import { useState } from "react";
import DocumentoRenderizado, { type SecaoRenderizada } from "@/components/politica/DocumentoRenderizado";

// Versão substituída: mostra o conteúdo que ela tinha (snapshot gravado no
// momento da criação — ver Versao.conteudoSnapshot), sem servir nenhum
// arquivo. Download genuinamente impossível — não é só uma questão de rótulo
// do botão (ver docs/superpowers/specs/2026-08-02-versao-substituida-ver-nao-baixar-design.md).
export default function VerVersaoAntiga({
  secoes,
  tituloPolitica,
  areaNome,
  codigo,
  publicadaEm,
  revisao,
}: {
  secoes: SecaoRenderizada[];
  tituloPolitica: string;
  areaNome: string;
  codigo: string | null;
  publicadaEm: Date;
  revisao: number;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
      >
        Ver
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <DocumentoRenderizado
              secoes={secoes}
              tituloPolitica={tituloPolitica}
              areaNome={areaNome}
              codigo={codigo}
              publicadaEm={publicadaEm}
              revisao={revisao}
            />
            <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-3">
              <span className="text-xs text-amber-700">
                Versão substituída — somente leitura, download indisponível.
              </span>
              <button
                onClick={() => setAberto(false)}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros (o componente ainda não é usado em lugar nenhum — Task 5 conecta).

- [ ] **Step 3: Commit**

```bash
git add components/politica/VerVersaoAntiga.tsx
git commit -m "feat(versoes): componente VerVersaoAntiga (modal read-only, sem download)"
```

---

### Task 5: Tabela de Versões decide Baixar/Ver/nada

**Files:**
- Modify: `app/(shell)/catalogo/[id]/page.tsx`

**Interfaces:**
- Consumes: `VerVersaoAntiga`, `SecaoRenderizada` (Task 4), `Versao.conteudoSnapshot`/
  `revisaoNaEpoca` (Task 1).

- [ ] **Step 1: Importar `VerVersaoAntiga` no topo do arquivo**

```ts
import VerVersaoAntiga from "@/components/politica/VerVersaoAntiga";
import type { SecaoRenderizada } from "@/components/politica/DocumentoRenderizado";
```

- [ ] **Step 2: Substituir a célula de Ação (linhas 314-320 do arquivo atual)**

De:

```tsx
                  <td className="px-4 py-2">
                    {v.documento && (
                      <a href={`/api/documentos/${v.documento.id}`} className={BUTTON_CLASSES}>
                        Baixar
                      </a>
                    )}
                  </td>
```

Para:

```tsx
                  <td className="px-4 py-2">
                    {v.documento?.oficial && v.estado === "substituida" ? (
                      v.conteudoSnapshot ? (
                        <VerVersaoAntiga
                          secoes={v.conteudoSnapshot as unknown as SecaoRenderizada[]}
                          tituloPolitica={politica.titulo}
                          areaNome={politica.area.nome}
                          codigo={politica.codigo}
                          publicadaEm={v.criadaEm}
                          revisao={v.revisaoNaEpoca ?? 0}
                        />
                      ) : null
                    ) : (
                      v.documento && (
                        <a href={`/api/documentos/${v.documento.id}`} className={BUTTON_CLASSES}>
                          Baixar
                        </a>
                      )
                    )}
                  </td>
```

Nota: `v.documento?.oficial && v.estado === "substituida"` cobre exatamente os casos 3-5 da regra
da spec; qualquer outro caso (ativa, ou anexo manual em qualquer estado) cai no `else` e mantém o
"Baixar" de sempre — inclusive anexo manual substituído, que continua baixável (decisão de
escopo).

- [ ] **Step 3: Verificar tipos e rodar a suíte inteira**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros, todos os testes passam (esta página não tem teste automatizado próprio).

- [ ] **Step 4: Commit**

```bash
git add "app/(shell)/catalogo/[id]/page.tsx"
git commit -m "feat(versoes): tabela decide Baixar/Ver/nada por versao"
```

---

### Task 6: Verificação final + PR

**Files:** nenhum (só verificação e abertura de PR).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx vitest run`
Expected: tudo limpo, todos os testes passam.

- [ ] **Step 2: Verificação manual no navegador**

Publicar uma política de teste com conteúdo em ao menos 1 seção. Reabrir para revisão, editar
(mudar o texto de alguma seção), publicar de novo. Na tela de detalhe, confirmar: a versão 1
(agora substituída) mostra "Ver", e o modal mostra o texto ORIGINAL (da versão 1, não o texto
editado); a versão 2 (ativa) mostra "Baixar" normal. Confirmar também que uma versão substituída
criada ANTES desta feature (se houver alguma no banco local) não mostra nenhum botão.

- [ ] **Step 3: Criar branch, push e abrir PR no Azure DevOps**

```bash
git push -u origin feat/versao-substituida-ver
az repos pr create --repository g-politicas --source-branch feat/versao-substituida-ver --target-branch main \
  --title "feat: versao substituida vira Ver em vez de Baixar" \
  --description "Ver docs/superpowers/specs/2026-08-02-versao-substituida-ver-nao-baixar-design.md para o design completo." \
  --open
```

- [ ] **Step 4: Aguardar aprovação + build da policy antes de completar o merge.**
