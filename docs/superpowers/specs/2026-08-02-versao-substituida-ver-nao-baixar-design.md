# Versão substituída — "Ver" em vez de "Baixar"

## Contexto e motivação

Hoje, na tabela de Versões da tela de detalhe (`app/(shell)/catalogo/[id]/page.tsx`), toda versão com
documento anexado mostra um link "Baixar" — inclusive versões já substituídas por uma republicação
(reabrir → editar → publicar de novo). O usuário quer que a versão antiga (substituída) do **documento
oficial** deixe de poder ser baixada: o botão vira "Ver" (mostra o conteúdo na tela, sem servir o
arquivo) — só a versão **ativa** continua com "Baixar" normal.

## Decisões confirmadas com o usuário

- A regra vale **só para o documento oficial** (gerado automaticamente na publicação). Anexos manuais
  (`Documento.oficial = false`) continuam com "Baixar" normal, não importa o estado da versão.
- "Ver" não pode ser feito só trocando `Content-Disposition` pra `inline` — o oficial é sempre `.docx`
  (nunca PDF), e navegador não tem visualizador nativo de Word; isso não impediria de fato o download
  (o Word abre o arquivo e a pessoa salva por fora). "Ver" **renderiza o conteúdo das seções na tela**
  (mesmo padrão da tela de Ciência de Leitura), sem servir nenhum arquivo — download genuinamente
  impossível.
- Snapshot de conteúdo hoje só existe em `Politica.conteudoPublicado`, um campo único sobrescrito a
  cada republicação — não existe snapshot por versão. Por isso, versões **já substituídas antes desta
  feature** não têm como mostrar o conteúdo exato daquela época sem abrir o `.docx` antigo (que é
  exatamente o que estamos evitando). Decisão: essas versões antigas **não mostram nenhum botão**
  (nem Ver, nem Baixar). Só versões substituídas **a partir desta feature** (que passam a guardar seu
  próprio snapshot no momento da criação) mostram "Ver".

## Modelo de dados

`Versao` ganha dois campos opcionais:

```prisma
model Versao {
  id              String       @id @default(cuid())
  politica        Politica     @relation(fields: [politicaId], references: [id])
  politicaId      String
  numero          Int
  estado          EstadoVersao @default(ativa)
  documento       Documento?
  conteudoSnapshot Json?       // NOVO — cópia do snapshot das seções no momento em que ESTA versão foi criada
  revisaoNaEpoca   Int?        // NOVO — Politica.revisao válido naquele momento (pro cabeçalho institucional)
  criadaEm        DateTime     @default(now())

  @@unique([politicaId, numero])
}
```

Populados dentro da mesma transação de `publicarPolitica` (`app/(shell)/catalogo/[id]/estado-actions.ts`),
sem query extra — o `snapshot` que já é calculado ali (via `montarSnapshot`) passa a ser gravado em dois
lugares: `Politica.conteudoPublicado` (como hoje, snapshot "atual") e `Versao.conteudoSnapshot` na nova
versão sendo criada (histórico, nunca mais sobrescrito). `revisaoNaEpoca` recebe o mesmo valor de
`novaRevisao` que já é calculado ali.

Migration é aditiva: as duas colunas são nullable, versões existentes ficam `null`.

## Regra de exibição (tabela de Versões)

Para cada linha da tabela, a coluna "Ação" decide:

1. `v.documento` não existe → nada (comportamento atual).
2. `v.documento.oficial === false` (anexo manual) → **Baixar**, sempre, qualquer estado.
3. `v.documento.oficial === true` + `v.estado === "ativa"` → **Baixar** (comportamento atual).
4. `v.documento.oficial === true` + `v.estado === "substituida"` + `v.conteudoSnapshot` preenchido →
   **Ver** (abre modal read-only).
5. `v.documento.oficial === true` + `v.estado === "substituida"` + `v.conteudoSnapshot` nulo (versão
   legada, anterior a esta feature) → nada.

## Componente "Ver"

`components/politica/CienciaLeitura.tsx` já renderiza seções em modo leitura com cabeçalho/rodapé
institucional (Manual SGI cap. 11-12). Extrair essa renderização para um componente compartilhado
`components/politica/DocumentoRenderizado.tsx`, que recebe `secoes`, `tituloPolitica`, `areaNome`,
`codigo`, `publicadaEm`, `revisao` e devolve o JSX do cabeçalho + seções + rodapé (sem nenhuma lógica
de ciência/confirmação — puramente apresentacional).

Novo componente `components/politica/VerVersaoAntiga.tsx`: botão "Ver" que abre um modal (mesmo padrão
visual de `CienciaLeitura`: `fixed inset-0` + card centralizado) renderizando `DocumentoRenderizado`
com os dados da versão (`v.conteudoSnapshot` como `secoes`, `v.revisaoNaEpoca` como `revisao`,
`v.criadaEm` como `publicadaEm`), mais um aviso no topo do modal: "Versão substituída — somente
leitura, download indisponível." Nenhum link de arquivo, nenhuma chamada a `/api/documentos/[id]`.

`CienciaLeitura.tsx` passa a usar `DocumentoRenderizado` internamente no lugar do bloco de renderização
que já tem hoje — comportamento idêntico, só reorganizado (extração pura, sem mudança visual).

## Fora de escopo

- Recuperar snapshot exato de versões já substituídas antes desta feature (não mostram botão).
- Aplicar a regra a anexos manuais.
- A "preview antes de publicar" (proposta anterior, engavetada) — fica pronta como possibilidade
  futura já que `DocumentoRenderizado` fica reaproveitável, mas não faz parte deste escopo.

## Testes

- `tests/estado-actions.test.ts`: `publicarPolitica` grava `conteudoSnapshot`/`revisaoNaEpoca` na nova
  versão (mock de `versao.create` recebe esses campos no `data`).
- Verificação manual: republicar uma política, confirmar que a versão anterior mostra "Ver" (e o modal
  renderiza o conteúdo daquela versão, não o atual), e que a versão ativa continua "Baixar".
