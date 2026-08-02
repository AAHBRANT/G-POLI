# Consórcios — destino de documento além de AAHBRANT

## Contexto e motivação

Hoje todo documento no G-Políticas pertence à AAHBRANT e a visibilidade é controlada por Setor
interno (`Area`) + um público-alvo opcional (`audienciaSetores`/`audienciaUsuarios`, usado para
notificação de publicação e também para restringir quem enxerga). Não existe hoje o conceito de
"empresa/consórcio externo" — obras feitas em parceria com outra pessoa jurídica, cujo documento
deve ser visível só para quem está naquele consórcio, não para o quadro AAHBRANT inteiro.

Pedido: ao criar um documento, escolher um destino — "AAHBRANT (todos)" ou um consórcio
específico cadastrado. Só quem estiver vinculado àquele consórcio (além dos perfis de gestão)
enxerga o documento.

## Decisões confirmadas com o usuário

- Setor e Consórcio **coexistem** — uma pessoa tem seu setor interno normal e pode também estar
  vinculada a 1+ consórcios, ao mesmo tempo.
- Um documento tem **um único destino**: AAHBRANT (todos) OU exatamente um consórcio. Nunca
  vários consórcios no mesmo documento.
- Consórcio é uma **entidade nova**, separada de `Area`/Setor — não reaproveita a tabela de
  setores (evita contaminar filtros/badges/formulários que hoje são só de setor interno).
- Gestão de consórcio (criar, renomear, ativar/desativar, vincular usuários) é **só Super Admin**
  — mesma régua de hoje para Setores.
- Ao escolher um consórcio como destino, o seletor de público-alvo por setor/usuário
  (`AudienciaSelector`) **some** — o consórcio já define sozinho quem vê; os dois não se combinam.
- Gestor de Setor (perfil `area`) também fica **restrito** por consórcio: só vê documento de
  consórcio se estiver vinculado a ele — igual ao colaborador comum. Documentos do próprio setor
  dele continuam sempre visíveis (rascunho incluso), independente de consórcio.
- Super Admin / Admin / SGI / Diretoria continuam vendo tudo, sem restrição de consórcio (mesma
  regra de hoje).

## Modelo de dados

```prisma
model Consorcio {
  id        String     @id @default(cuid())
  nome      String     @unique
  ativo     Boolean    @default(true)
  membros   Usuario[]  @relation("UsuarioConsorcios")
  politicas Politica[]
  criadoEm  DateTime   @default(now())
}
```

- `Usuario` ganha `consorcios Consorcio[] @relation("UsuarioConsorcios")` (N:N, paralelo ao
  `setores` de hoje).
- `Politica` ganha `consorcioId String?` + `consorcio Consorcio? @relation(fields: [consorcioId],
  references: [id])`. `null` = AAHBRANT (todos, comportamento atual inalterado).
- Migration aditiva, sem dado existente para migrar (toda política existente fica com
  `consorcioId = null`, ou seja, continua exatamente como está).

## Gestão administrativa (Super Admin)

- Nova aba **"Consórcios"** em `/admin`, ao lado de Usuários/Setores/Auditoria.
- Novo componente `GerenciarConsorcios.tsx`, mesmo padrão de `GerenciarSetores.tsx`: criar
  (nome), renomear, ativar/desativar. Reaproveita o mesmo layout e Server Actions análogas
  (`criarConsorcio`, `renomearConsorcio`, `alternarConsorcioAtivo`).
- `LinhaUsuario.tsx` ganha um segundo editor de chips (igual ao de setor hoje): botão "editar"
  abre lista de consórcios ativos para marcar/desmarcar quais o usuário integra.
- `ConvidarUsuarioForm.tsx` **não muda** — vínculo a consórcio é feito depois, editando a linha
  do usuário já convidado. Evita inchar o formulário de convite com mais um seletor.
- Nova permissão pura em `lib/auth/rbac.ts`: `podeGerirConsorcios` (mesma regra de
  `podeGerirSetores`, só Super Admin) — nome próprio para manter os call-sites descritivos, ainda
  que a checagem seja idêntica.

## Criação/publicação do documento

- `NovaPoliticaForm.tsx` ganha um `<select>` "Destino": primeira opção `AAHBRANT (todos)` (valor
  vazio, selecionada por padrão), seguida da lista de consórcios ativos.
- `criarPolitica` (Server Action) passa a aceitar e persistir `consorcioId` (nulo se "AAHBRANT").
- Na tela de detalhe (`app/(shell)/catalogo/[id]/page.tsx`), quando `politica.consorcioId` está
  preenchido, o componente `AudienciaSelector` não é renderizado — no lugar, mostra só o nome do
  consórcio de destino (texto simples, sem edição de público-alvo).
- Consórcio de destino é definido na criação e **não muda depois** neste v1 (sem tela de "mudar
  destino" de uma política já existente — decisão de escopo, ver "Fora de escopo").

## Regra de visibilidade (`lib/auth/rbac.ts`)

`UsuarioAtual` ganha um novo campo `consorcios: string[]` (ids dos consórcios vinculados),
carregado em `lib/auth/usuario.ts` junto com `setores`, do mesmo jeito.

`filtroVisibilidade` muda em dois pontos:

1. **Perfil `area` (Gestor de Setor)** — hoje: `{ OR: [{estado: "publicada"}, {areaId: {in:
   setores}}] }` (vê toda publicada, de qualquer setor). Passa a ser:

   ```
   OR: [
     { estado: "publicada", consorcioId: null },
     { estado: "publicada", consorcioId: { in: u.consorcios } },  // só se tiver consórcio
     { areaId: { in: u.setores } },                                // próprio setor, sempre
   ]
   ```

2. **Colaborador comum / área sem setor** (`filtroPublicadaPorAudiencia`) — hoje: publicada +
   dentro do público-alvo (setor/usuário) ou público-alvo vazio. Passa a ser:

   ```
   OR: [
     { estado: "publicada", consorcioId: null, OR: [<regra de público-alvo de hoje>] },
     { estado: "publicada", consorcioId: { in: u.consorcios } },
   ]
   ```

   Ou seja: quando o documento tem consórcio, a regra de público-alvo por setor/usuário não se
   aplica (é substituída pelo vínculo de consórcio); quando não tem, tudo funciona exatamente como
   hoje.

Super Admin / Admin / SGI / Diretoria: sem mudança (retornam `{}`, veem tudo).

## Notificação de publicação (Teams)

Hoje quem é notificado = quem enxerga (mesma semântica documentada em `dominio.ts`). Quando a
política tem `consorcioId`, os destinatários da notificação passam a ser os usuários vinculados
àquele consórcio (em vez da união setor/usuário do `AudienciaSelector`, que nesse caso nem
aparece).

Implementação real (decisão registrada na Task 8 do plano): a busca dos membros do consórcio
**não** virou uma função nova em `lib/politica/dominio.ts` — esse módulo é livre de Prisma por
design (funções puras, testáveis sem banco), e resolver membros de um consórcio exige uma query.
Em vez disso, a lógica entra direto em `resolverAudiencia`, em
`app/(shell)/catalogo/[id]/estado-actions.ts`: quando `politica.consorcioId` está preenchido, a
função busca o `Consorcio` (com seus `membros` ativos) e retorna esses usuários no lugar da união
setor/usuário; caso contrário, segue o fluxo de sempre (`audienciaVazia`/`unirAudiencia`).
`resolverAudiencia` é reaproveitada tanto pela notificação do Teams quanto pela criação de
`Pendencia`, evitando duas cópias da mesma lógica.

## Fora de escopo (v1)

- Documento pertencer a mais de um consórcio ao mesmo tempo.
- Combinar consórcio com público-alvo granular (setor/usuário específico dentro do consórcio).
- Vincular consórcio já no formulário de convite do usuário.
- Trocar o destino (AAHBRANT ↔ consórcio) de uma política depois de criada.
- Perfil "Gestor de Consórcio" (equivalente ao Gestor de Setor) — gestão fica só com Super Admin
  por enquanto.

## Testes

- `lib/auth/rbac.ts`: casos novos em `tests/rbac.test.ts` — colaborador dentro/fora do consórcio,
  Gestor de Setor dentro/fora do consórcio (incluindo o caso "é do próprio setor mas não do
  consórcio — ainda vê, porque é dono"), Super Admin sempre vê.
- `resolverAudiencia` (em `app/(shell)/catalogo/[id]/estado-actions.ts`): coberto indiretamente
  pelos testes de publicação/notificação que exercitam o caminho com `consorcioId` preenchido —
  não há função pura equivalente em `dominio.ts` (ver seção "Notificação de publicação" acima).
- Verificação manual: criar consórcio, vincular 1 usuário, criar política destinada a esse
  consórcio, confirmar que outro colaborador (fora do consórcio) não vê e o vinculado vê.
