# Geração automática do documento oficial (.docx) na publicação

Data: 2026-07-30
Status: aprovado pelo usuário (conversa), aguardando plano de implementação

## Contexto

O modal de Ciência de Leitura ([components/politica/CienciaLeitura.tsx](../../../components/politica/CienciaLeitura.tsx))
reproduz em HTML o cabeçalho/rodapé institucional do Manual de Padronização
Documental AAHBRANT. Essa reprodução já passou por 3 rodadas de correção na
mesma sessão (logo errada, estrutura de colunas errada, asset não incluído na
imagem Docker) — cada ajuste do padrão visual virou um PR de código.

Proposta do usuário: gerar o **documento Word oficial de verdade** (não uma
reprodução em HTML) a partir do conteúdo das seções estruturadas, no momento
da publicação, e disponibilizá-lo pra download — reaproveitando o mecanismo
de "Versões" que já existe. Isso elimina a categoria inteira de bug (drift
entre a reprodução em código e o padrão real), porque o `.docx` gerado usa
o modelo Word de verdade, não uma tentativa de replicá-lo em HTML/Tailwind.

Decisões já fechadas com o usuário (nesta conversa):
1. Sem PDF, sem visualizador embutido — só o `.docx`, baixável (mecanismo já
   existe: `/api/documentos/[id]`).
2. Gerado no momento de **Publicar** (não sob demanda a cada download).
3. Upload manual de arquivo **continua existindo**, mas muda de papel: deixa
   de ser "a versão do documento" e passa a ser **anexo de apoio** (ex.:
   planilha padrão de reembolso anexada a uma Política de Reembolso).
4. Documento oficial gerado e anexos manuais aparecem na **mesma lista**
   "Versões", com rótulo diferenciando os dois.
5. Geração via **modelo Word real** (biblioteca `docx-templates`, MIT — ver
   nota de licença abaixo), não construção programática do zero — o usuário
   já enviou o arquivo modelo (`modelo inicial.docx`, cabeçalho/rodapé
   conferem 1:1 com o que já implementamos em HTML).
6. Falha na geração **bloqueia a publicação** (fail-closed, mesma filosofia
   já usada em `docs/DEPLOY.md` pra migração de banco).

## Não-objetivos (fora de escopo agora)

- Visualizador de PDF embutido.
- Conversão automática Word → PDF.
- Editor visual do modelo dentro do app (o SGI edita o `.docx` direto no
  Word).
- Suporte a `comunicado_normativo` no formato especial de Comunicado Interno
  (CI) do SGI — decisão já tomada em sessão anterior, sem mudança aqui.
- Migrar anexos manuais já existentes hoje (uploads antigos) para a nova
  semântica — ficam como estão; a mudança de comportamento vale só daqui pra
  frente (mesmo princípio das PRs #46-#48: fase de testes, sem retrocompat).

## Arquitetura

### 1. Modelo (`templates/politica-modelo.docx`)

Cópia editada do `modelo inicial.docx` enviado pelo usuário. Troca dos
valores de exemplo do cabeçalho por tags do `docx-templates`:

| Campo do cabeçalho (modelo atual) | Tag no template |
|---|---|
| `PROCEDIMENTO DE CONTROLE DE INFORMAÇÃO DOCUMENTADA` | `{titulo}` |
| `AHBT-PRO-SGI-001-00` | `{codigo}` |
| `___/___/______` | `{data}` |
| `Área Responsável: SGI` | `{areaResponsavel}` |
| `Revisão: 00` | `{revisao}` |

Campo `Unidade:` fica vazio (mesma decisão já tomada pro cabeçalho HTML).
Campo `Página: Página 1 de 2` — mantém o texto fixo do modelo por ora (não
temos paginação real calculada; mesma decisão já tomada pro HTML, que omitiu
esse campo — aqui não dá pra omitir sem editar a tabela do modelo, então
fica com um valor neutro tipo `Página 1` a definir na implementação).

Corpo do documento (hoje vazio no modelo enviado) ganha um bloco de loop
(sintaxe do `docx-templates`, delimitador customizado `{ }`):

```
{FOR secao IN secoes}
{$secao.codigo} · {$secao.titulo}
{$secao.corpo}
{END-FOR secao}
```

Seções do tipo tabela (colunas/linhas): `docx-templates` suporta loop dentro
de linha de tabela nativamente (sem módulo pago) — a seção-tabela vira uma
tabela Word de verdade, com `{FOR linha IN $secao.linhas}` numa linha
template do próprio Word. Sem perda de fidelidade aqui.

### 2. Geração (`lib/politica/gerarDocx.ts`, novo)

```ts
async function gerarDocumentoOficial(politica, seções, area): Promise<Buffer>
```

- Lê `templates/politica-modelo.docx` do disco (ou embutido no bundle —
  definir no plano se via `fs.readFile` relativo ao projeto ou import
  estático).
- Usa `docx-templates` (`createReport()`) pra preencher as tags.
- Retorna o buffer do `.docx` final.
- Erros de template (tag faltando, sintaxe) devem ser capturados e
  reportados com mensagem específica (não engolir em `catch {}` genérico —
  ver `docs/learnings.md`, regra já promovida sobre isso).

**Nota de licença**: `docxtemplater` (opção inicialmente cogitada) é AGPL no
núcleo gratuito — pra um app proprietário rodando como serviço interno, a
AGPL obriga a disponibilizar o código-fonte completo a quem acessa o
serviço (cláusula de "uso em rede"), o que não serve pra este projeto sem
comprar licença comercial. `docx-templates` é MIT, sem essa exigência —
por isso a escolha.

### 3. Hook na publicação (`estado-actions.ts`)

Dentro de `publicarPolitica`, depois do snapshot (`conteudoPublicado`) ser
montado e antes de confirmar o novo estado `publicada`:

1. Gera o `.docx` via `gerarDocumentoOficial`.
2. Se falhar → aborta a publicação inteira, devolve erro pro usuário
   (fail-closed, decisão #6 acima). A política continua em rascunho.
3. Se ok → `salvarArquivo()` (mecanismo já existente, sem mudança) com o
   buffer gerado.
4. Dentro da mesma transação que já publica a política: marca a versão
   "oficial" anterior (se houver) como substituída, cria a nova versão
   marcada como oficial e ativa.

### 4. Modelo de dados

`Documento` ganha um campo novo:

```prisma
model Documento {
  ...
  oficial Boolean @default(false) // true = gerado automaticamente na publicação; false = anexo manual
}
```

Migration: `ALTER TABLE "Documento" ADD COLUMN "oficial" BOOLEAN NOT NULL DEFAULT false;`
— expand puro, sem risco pros dados existentes (tudo que já existe vira
"anexo", que é semanticamente correto: uploads manuais de hoje).

**Mudança de comportamento em `adicionarVersao`** (upload manual,
`app/(shell)/catalogo/[id]/actions.ts`): hoje todo upload novo marca a
versão anterior como `substituida`. Isso deixa de fazer sentido pra anexos
(uma planilha nova não "substitui" a anterior — convivem). Fix: a query de
"marcar anterior como substituída" passa a filtrar
`documento: { oficial: true }` — ou seja, só a cadeia de documentos oficiais
tem substituição; anexos manuais empilham, todos `ativa`.

### 5. UI (`app/(shell)/catalogo/[id]/page.tsx`, tabela de Versões)

Coluna nova ou badge: "Documento oficial" (destaque, ex. cor marsala) vs
"Anexo" (neutro) — baseado em `documento.oficial`. Sem mudança na mecânica
de download (`/api/documentos/[id]` já funciona pra qualquer `Documento`,
independente da origem).

## Testes

- `lib/politica/gerarDocx.test.ts` (novo): gera um `.docx` com dados de
  teste, abre o zip resultante, confirma que os textos esperados (`{titulo}`
  preenchido, `{codigo}` preenchido, cada seção) aparecem no `document.xml`
  gerado — mesma técnica de extração de texto já usada nesta sessão pra
  inspecionar o Manual/planilha.
- Teste de fail-closed: mock do gerador lançando erro → `publicarPolitica`
  retorna erro e o estado da política continua `rascunho` (não muda pra
  `publicada`).
- Teste de `adicionarVersao`: dois uploads manuais seguidos → ambos ficam
  `ativa` (não substituem um ao outro).
- Verificação manual: publicar uma política de teste, baixar o `.docx`
  gerado, abrir no Word/LibreOffice, comparar cabeçalho/rodapé com o
  `modelo inicial.docx` enviado pelo usuário.

## Riscos / pontos em aberto pro plano de implementação

1. **Campo "Página"** no modelo — decidir valor neutro (hoje é texto fixo
   no `.docx`, diferente do HTML que omitiu o campo inteiro).
2. **Onde vive `templates/politica-modelo.docx`** no repositório e como é
   lido em runtime (arquivo estático vs. embutido no build do Next —
   precisa estar disponível na imagem Docker final, mesma classe de
   problema já visto com `public/`, ver PR #49 de fix do Dockerfile, que
   corrigiu exatamente essa classe de bug pra logo).
3. Dependência nova: `docx-templates` no `package.json` (MIT, licença já
   verificada — sem restrição de uso comercial/SaaS).
