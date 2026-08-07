# Controle de Revisões no Corpo do .docx Oficial — Design

## Problema

O Manual de Padronização Documental do SGI da AAHBRANT (cap. 19, replicado
em `padrao-documental-aahbrant/SKILL.md`) exige que toda Política,
Procedimento, Regulamento e demais documentos controlados tragam uma
tabela "Controle de Revisões" (`Revisão | Data | Descrição da Alteração |
Responsável`) como **primeiro elemento do corpo**, antes do capítulo 1.

O gerador do `.docx` oficial (`lib/politica/gerarDocx.ts`) hoje só recebe
um campo escalar `revisao` (número, ex. `"00"`) para o cabeçalho
institucional — nunca gera a tabela dentro do corpo. O comentário em
`lib/politica/esqueleto.ts:14-16` já registra a intenção ("deve ser
montada na exportação, não digitada pelo usuário"), mas isso nunca foi
implementado.

## Escopo

Vale para os 8 tipos de documento do sistema (mesmo gerador,
`gerarDocumentoOficial`, compartilhado por todos via `Politica.tipo`) — não
é específico de Política. Fora de escopo: Carta e Ata (tipos que a
skill já isenta desta tabela) — o sistema hoje não tem esses 2 tipos
implementados, então não há nada a excluir na prática.

## Dados novos

Dois campos novos em `Versao` (migration aditiva):

- `descricaoAlteracao String` — texto da coluna "Descrição da Alteração".
- `responsavelNome String` — texto da coluna "Responsável".

Ambos preenchidos no momento da criação da `Versao` (publicação ou
republicação) e nunca editados depois — imutáveis, como o resto do
snapshot de versão (`conteudoSnapshot`, `revisaoNaEpoca`).
`Versao.revisaoNaEpoca` e `Versao.criadaEm` (já existentes) cobrem as
colunas "Revisão" e "Data".

## Descrição da alteração

- **Revisão inicial** (`novaRevisao === 0`, primeira publicação): sempre o
  texto fixo `"Emissão inicial do documento"` — sem chamada de IA, sem
  diff (não há "antes"). Bate exatamente com o exemplo do Manual (cap. 19).
- **Republicação** (`novaRevisao > 0`): nova função
  `gerarDescricaoRevisao(secoesAnteriores: SecaoSnapshot[], secoesAtuais: SecaoSnapshot[]): Promise<string>`
  em `lib/politica/ai.ts`, reaproveitando a infraestrutura de IA já
  existente (`iaDisponivel()`, mesmo padrão de chamada de
  `gerarRascunhoNorma`). Recebe o snapshot anterior (`politica.conteudoPublicado`,
  ainda disponível em `publicarPolitica` antes do update) e o novo
  snapshot recém-montado (`montarSnapshot(politica.secoes)`), e pede à IA
  um resumo de 1 frase curta do que mudou, no estilo dos exemplos do
  Manual ("Inclusão do item 4.2").
- **Fallback best-effort**: se a IA não estiver configurada
  (`!iaDisponivel()`), falhar, ou responder algo inválido, usa o texto
  genérico `` `Republicação — revisão ${String(novaRevisao).padStart(2, "0")}` ``.
  Nunca bloqueia a publicação — mesma filosofia já usada em
  pendência/notificação (best-effort, catch nunca sobe).

## Responsável

Nome de quem publicou (`usuario.nome` — o mesmo valor que já vai para
`Politica.publicadaPorNome`), gravado por linha em `Versao`. Não pode vir
só de `Politica.publicadaPorNome`, porque esse campo é sobrescrito a cada
republicação — as linhas antigas da tabela precisam continuar mostrando
quem fez CADA revisão, não a republicação mais recente.

## Template Word

O modelo (`templates/politica-modelo.docx`) já usa o padrão
`{FOR secao IN secoes}...{END-FOR secao}` do `docx-templates` (confirmado
por inspeção do XML). A tabela nova é uma tabela real do Word, inserida
como primeiro elemento do corpo (antes do título "1 Objetivo"), com uma
linha de cabeçalho fixa (`Revisão | Data | Descrição da Alteração |
Responsável`, negrito, Arial e cor institucional marsala `#670000` —
conforme padrão de tabelas do Manual, cap. 9).

Para repetir a linha de dados por item da lista, o `FOR`/`END-FOR` precisa
ficar em **linhas próprias da tabela** — três linhas ao todo abaixo do
cabeçalho:

1. linha contendo só `{FOR rev IN controleRevisoes}` (1ª célula; as demais
   com parágrafo vazio);
2. linha de dados: `{$rev.revisao} | {$rev.data} | {$rev.descricao} |
   {$rev.responsavel}` — é esta que se repete;
3. linha contendo só `{END-FOR rev}` (1ª célula).

As linhas 1 e 3 são consumidas e removidas pelo `docx-templates` na
renderização; não sobra linha vazia.

> **Atenção — erro fácil de cometer.** Se `{FOR}` e `{END-FOR}` ficarem na
> **MESMA** linha da tabela, o `docx-templates` gera **COLUNAS**, não
> linhas: ele repete os nós entre os dois comandos dentro do ancestral
> comum (as `<w:tc>`), produzindo uma única linha com N×4 células e XML
> inválido (`<w:tcPr>` duplicado dentro do mesmo `<w:tc>`). São dois
> padrões distintos e documentados — ver o README do `docx-templates`,
> seção "`FOR` and `END-FOR`" (`FOR loops also work over table rows` para
> repetir linhas; o exemplo seguinte, "dynamically generate columns", é o
> que usa `FOR`/`END-FOR` na mesma linha). Verificado empiricamente por
> render real durante a implementação da Task 3.

`gerarDocx.ts` ganha um campo novo em `DadosDocumentoOficial`:

```ts
controleRevisoes: Array<{ revisao: string; data: string; descricao: string; responsavel: string }>;
```

passado para `createReport({ data: { ..., controleRevisoes } })`, mesmo
padrão já usado para `secoes`.

## Sequência em `publicarPolitica`

Ordem exata (dentro de `app/(shell)/catalogo/[id]/estado-actions.ts`,
antes da geração do `.docx`, que hoje já roda antes da transação de
persistência):

1. Buscar as `Versao` existentes desta política
   (`prisma.versao.findMany({ where: { politicaId: id }, orderBy: { numero: "asc" }, select: { revisaoNaEpoca, criadaEm, descricaoAlteracao, responsavelNome } })`).
2. Calcular a descrição da nova linha: fixa (`novaRevisao === 0`) ou via
   `gerarDescricaoRevisao` com fallback (`novaRevisao > 0`).
3. Montar `controleRevisoes` = linhas antigas formatadas + a linha nova
   (`{ revisao: String(novaRevisao).padStart(2,"0"), data: agora.toLocaleDateString("pt-BR"), descricao, responsavel: usuario.nome }`).
4. Gerar o `.docx` com a lista completa (`gerarDocumentoOficial({ ..., controleRevisoes })`).
5. Só DEPOIS disso, seguir a transação já existente que persiste a nova
   `Versao` — agora incluindo `descricaoAlteracao` e `responsavelNome` já
   calculados no passo 2, para nunca divergir do que foi impresso no
   `.docx` gerado no passo 4.

O fail-closed atual (falha ao gerar o `.docx` cancela a publicação) não
muda — continua cobrindo esta tabela também, já que ela faz parte do mesmo
`.docx`. O que É best-effort é só a geração da DESCRIÇÃO via IA (passo 2),
nunca a publicação inteira.

## Testes

- `gerarDescricaoRevisao`: mock da chamada de IA — retorna a frase da IA
  quando disponível; retorna o fallback genérico quando `iaDisponivel()`
  é falso, quando a chamada rejeita, e quando a resposta vem vazia/inválida.
- `publicarPolitica` (teste de integração já existente,
  `tests/estado-actions.test.ts`): primeira publicação monta
  `controleRevisoes` com 1 linha (`"Emissão inicial do documento"`,
  responsável = publicador); republicação monta com N+1 linhas, preservando
  as descrições/responsáveis antigos e usando a nova descrição calculada.
- Geração do `.docx`: teste manual (build local, `soffice --convert-to pdf`
  + inspeção visual) confirmando que a tabela aparece antes de "1
  Objetivo", com o cabeçalho em negrito e cor institucional — cobertura
  automatizada de XML de template fica fora de escopo (mesmo padrão já
  aceito para `gerarDocx.ts` nesta base de código).

## Fora de escopo (explícito)

- Estrutura por tipo de documento (Procedimento/Regulamento têm capítulos
  diferentes de Política no Manual, cap. 16) — gap pré-existente, não
  desta feature.
- Edição manual da descrição pelo usuário após a IA gerar — a IA decide,
  sem revisão humana antes de publicar (aceito como trade-off do
  best-effort; se motivar reclamação real, é spec nova).
- Cartas e Atas de Reunião — tipos não implementados no sistema hoje.
