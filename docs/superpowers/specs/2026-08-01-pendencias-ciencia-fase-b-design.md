# Superfícies de UI de pendências de ciência (Fase B)

Data: 2026-08-01
Status: aprovado pelo usuário (conversa), aguardando plano de implementação

## Contexto

Continuação do sistema de pendências de ciência decomposto em 4 fases (ver
`docs/superpowers/specs/2026-07-30-pendencias-ciencia-nucleo-design.md`,
Fase A, já mergeada em `main`). A Fase A entregou o núcleo de dados: tabela
`Pendencia`, hooks de criação/resolução/cancelamento em `publicarPolitica`/
`darCiencia`/`revogarPolitica`, endpoint `GET /api/pendencias/contagem`
(`{ total, porTipo }`) e o hook client `usePendencias()`
(`lib/hooks/usePendencias.ts`, polling 30s).

Esta spec (Fase B) cobre as superfícies de UI que consomem esse núcleo:
badges na sidebar, sino de notificações no header, card na home, e toast no
primeiro acesso após publicação/republicação.

## Não-objetivos (fora desta fase)

- Dashboard/relatórios de conformidade — Fase C.
- Lembretes automáticos e qualquer agendamento — Fase D.
- Qualquer mudança no ramo "gestor/vê tudo" da home (métrica agregada
  `semCiencia` continua como está — é outra coisa, conformidade da empresa,
  não pendência pessoal).
- Status de ciência na página do documento — já resolvido na Fase A (gate de
  `minhaCiencia` corrigido pra comparar versão, mais o ajuste de consistência
  na lista "quem deu ciência").

## Decisões fechadas com o usuário

1. **Home**: a seção "Aguardando sua ciência" existente (query direta
   `Politica`/`Ciencia`, com o mesmo bug de versão que a Fase A corrigiu no
   gate da página de detalhe) é **substituída** pela mesma UI alimentada pela
   tabela `Pendencia` — uma fonte de verdade só, sem duplicar conceito.
2. **Sino**: ao clicar, abre dropdown com a lista real das pendências (não só
   contador + link) — busca sob demanda, sem polling próprio.
3. **Rastreio de "toast já visto"**: campo novo no banco
   (`Pendencia.notificadaEm`), não localStorage — sincroniza entre
   dispositivos (relevante pra Teams desktop + mobile).
4. **Badges na sidebar**: em cada tipo de documento (via `porTipo`) **e** no
   item "Painel" (total geral).
5. **Toast**: componente custom (sem dependência nova tipo sonner), seguindo
   o padrão visual de pill já usado no projeto.

## Arquitetura

### 1. Modelo de dados — 1 migration aditiva

```prisma
model Pendencia {
  // ...campos existentes (Fase A)
  notificadaEm DateTime? // null = toast ainda não mostrado nesta pendência
}
```

Nullable, sem default — puramente aditivo. Dado legado (toda `Pendencia`
existente) fica com `notificadaEm = null`, ou seja, "ainda não notificado".
Comportamento aceito: melhor mostrar um toast a mais (pendência antiga que o
usuário já viu de outra forma) do que nunca mostrar uma pendência nova.

### 2. Backend

**`GET /api/pendencias/lista`** (novo, mesmo padrão de auth de
`app/api/pendencias/contagem/route.ts`: `getUsuarioAtual()`, 401 sem sessão,
`force-dynamic`):

```ts
type ItemPendencia = {
  id: string;
  politicaId: string;
  titulo: string;
  codigo: string | null;
  tipo: TipoDocumento;
  publicadaEm: string; // ISO
  criadaEm: string;
  notificadaEm: string | null;
};
// GET -> { itens: ItemPendencia[] }
```

Query: `prisma.pendencia.findMany({ where: { usuarioId: usuario.id, estado:
"pendente" }, include: { politica: { select: { titulo, codigo, tipo } } },
orderBy: { criadaEm: "desc" }, take: 20 })`. Limite de 20 é deliberado — sino
e toast não paginam; usuário com mais de 20 pendências reais é sintoma de
outro problema, não desta tela (Fase C cobre o relatório completo).

**Server Action `marcarPendenciaNotificada(pendenciaId: string)`** — novo
arquivo `app/(shell)/pendencia-actions.ts` (não escopado a uma política
específica, diferente das actions existentes em `catalogo/[id]/`). Best-effort
(try/catch, `console.error`, sem re-throw, sem `revalidatePath`):

```ts
await prisma.pendencia.update({
  where: { id: pendenciaId, usuarioId: usuario.id },
  data: { notificadaEm: new Date() },
});
```

**Requisito de segurança explícito**: o `where` inclui `usuarioId:
usuario.id`, não só `id` — sem isso, um usuário poderia marcar como
notificada a pendência de outro (IDOR). Se o `update` não encontrar linha
correspondente (pendência de outro usuário, ou já não existe), Prisma lança
`P2025` — o try/catch trata isso como no-op silencioso, não como erro para o
chamador.

### 3. Componentes de UI

**Badges na sidebar (`components/shell/Sidebar.tsx`)** — já é `"use client"`.
Consome `usePendencias()` (hook existente, sem mudança). Item "Painel":
badge com `total` (só renderiza se `> 0`). Cada item de tipo de documento:
badge com `porTipo[tipo.valor] ?? 0` (só se `> 0`). Enquanto `carregando`
(primeiro fetch), não mostra nada — evita flash de "0". Visual: pill
vermelho pequeno, no mesmo slot `ml-auto` onde hoje só existe a tag "em
breve".

**Sino no header (`components/shell/SinoNotificacoes.tsx`, novo)** —
inserido em `Header.tsx` antes do `MenuPerfil`. Ícone + badge com `total` de
`usePendencias()`. Clique abre dropdown que busca `/api/pendencias/lista`
na abertura (não em polling). Item: título + badge de tipo (reaproveita
`TIPOS_DOCUMENTO`) + link pra `/catalogo/[id]` ou `/tipos/[tipo]` conforme o
tipo. "Nenhuma pendência" quando lista vazia. Fecha ao clicar fora (mesmo
padrão de `MenuPerfil`, a confirmar na implementação).

**Toast (`components/shell/ToastPendencias.tsx`, novo)** — montado uma vez
em `app/(shell)/layout.tsx`. No mount, busca `/api/pendencias/lista`, filtra
`notificadaEm === null`, mostra a **primeira** (mais recente) como toast —
só 1 por carregamento de página, não uma fila (evita spam com pendências
acumuladas). Pill flutuante (canto inferior direito, cor marsala,
auto-dismiss ~6s ou botão fechar). Ao mostrar, chama
`marcarPendenciaNotificada(id)` (fire-and-forget).

**Home (`app/(shell)/page.tsx`, ramo colaborador linhas 68-119)** — troca a
query atual (`prisma.politica.findMany` com `ciencias: { none: {...} }`) por
`prisma.pendencia.findMany({ where: { usuarioId: usuario.id, estado:
"pendente" }, include: { politica: {...} }, orderBy: { criadaEm: "desc" },
take: 8 })`. Mesma UI visual de hoje, só troca a fonte — corrige de brinde o
bug de versão (a `Pendencia` já nasce por versão correta) sem reaplicar
`filtroVisibilidade` (a `Pendencia` só existe pra quem já era audiência no
momento da publicação).

### 4. Tempo real, erros, testes

**Tempo real**: badges (sidebar + sino) seguem vivos via o polling 30s já
existente do `usePendencias()` — reuso puro, nada novo. Dropdown do sino e
toast buscam sob demanda (abertura/mount), não têm polling próprio — o badge
(que é live) já avisa quando há algo novo. Depois de dar ciência, a
pendência resolvida some do badge/sino/home no próximo ciclo de 30s
automaticamente, sem código novo.

**Erros**: `/api/pendencias/lista` segue o padrão 401 de `contagem/route.ts`;
falha de banco → 500 com `{ erro: true }`, client trata como lista vazia
temporária. `usePendencias()` ganha `erro: boolean` no retorno (Minor
pré-existente da Fase A, triado como fast-follow — esta fase é a hora certa,
já que badges/sino/toast passam a depender pesado desse hook).
`marcarPendenciaNotificada`: best-effort, nunca deixa o dismiss do toast
falhar visualmente por causa disso.

**Testes**:
- `usePendencias()` (ajuste do `erro`): teste unitário (mock fetch).
- `/api/pendencias/lista/route.ts`: teste de rota (mock prisma) —
  autenticado retorna itens certos; sem sessão 401; ordena por `criadaEm`
  desc; respeita limite 20.
- `marcarPendenciaNotificada`: teste de Server Action — marca só quando
  `usuarioId` bate (no-op silencioso se não bate, sem vazar erro de
  permissão).
- Home (ramo colaborador): teste de integração da query nova, seguindo a
  convenção de teste já usada no projeto pra server components/actions
  (confirmar padrão exato no plano).
- `Sidebar`/`SinoNotificacoes`/`ToastPendencias`: sem teste automatizado de
  componente React (projeto não tem essa convenção hoje — confirmar no
  plano); verificação manual no browser antes de fechar a fase, como na
  Fase A.

## Riscos / pontos em aberto pro plano de implementação

1. **Rota do link no sino/home por tipo**: confirmar se o link de cada item
   deve ir pra `/catalogo/[id]` sempre (rota canônica do documento,
   independente do tipo) ou variar por `/tipos/[tipo]` — a Fase A já
   estabeleceu que `/tipos/[tipo]` é uma lista, não o documento individual,
   então o link do item de pendência deveria ser sempre o documento
   (`/catalogo/[id]`), a confirmar no plano lendo a rota exata usada hoje.
2. **Fechar dropdown ao clicar fora**: confirmar se `MenuPerfil` já tem esse
   padrão implementado (hook `useEffect` com listener de `click` no
   `document`, ou biblioteca) pra reaproveitar exatamente, em vez de
   reinventar.
3. **Padrão de teste pra server components**: a Fase A testou só
   actions/rotas/funções puras, nunca um server component (`page.tsx`)
   diretamente — o plano precisa decidir se testa a query isolada (extraída
   pra uma função) ou pula teste automatizado dessa parte e cobre só
   manualmente.
