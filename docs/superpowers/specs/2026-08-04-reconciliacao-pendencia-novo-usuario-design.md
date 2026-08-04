# Reconciliação de Pendência ao Convidar Usuário — Design

## Problema

`Pendencia` (tabela de pendência de ciência de leitura) só é criada no
momento do publish de uma política, pra quem estava ativo/na audiência
NAQUELE momento (`criarPendencias` em
`app/(shell)/catalogo/[id]/estado-actions.ts:110-129`, alimentada por
`resolverAudiencia:35-64`).

Um usuário convidado DEPOIS de uma política já publicada nunca ganha a
`Pendencia` correspondente — o painel dele mostra "em dia" mesmo sem
nenhuma ciência de fato dada. Achado ao testar a conta DEV: 2 políticas
publicadas no catálogo, painel pessoal mostrando "Nenhuma pendência — você
está em dia."

O estado atual do banco já foi corrigido com um backfill pontual
(`scripts/backfill-pendencias.js`, documentado em `docs/DEPLOY.md`). Esta
spec cobre a correção estrutural, pra não recorrer no próximo convite.

## Escopo

Só o gatilho **criar/convidar usuário** (`convidarUsuario` em
`app/(shell)/admin/actions.ts:27-61`). Reativação de usuário (`ativo:
false→true`), vínculo a setor após a criação, e vínculo a consórcio ficam
FORA de escopo — nenhum desses três foi escolhido pelo usuário nesta
rodada. Se algum se mostrar necessário depois, é uma spec nova.

Consórcio também fica fora da lógica de resolução: `convidarUsuario` não
aceita `consorcioId` como parâmetro (só `setores: string[]`), então um
usuário recém-convidado nunca está em nenhum consórcio — políticas com
`consorcioId` preenchido nunca podem valer pra ele neste momento.

## Design

**Nova função pura** em `lib/politica/pendencia.ts`:

```ts
export type PoliticaAlvoReconciliacao = {
  id: string;
  tipo: string;
  publicadaEm: Date;
  setorIds: string[]; // ids de audienciaSetores desta política
};

// Filtra, entre as políticas publicadas SEM consórcio, quais valem pro
// usuário recém-criado: audiência vazia (aberta a todos) OU algum setor
// do convite bate com audienciaSetores da política. Espelha a regra de
// audienciaVazia/unirAudiencia (lib/politica/dominio.ts), na direção
// inversa (usuário → políticas, não política → usuários).
export function politicasParaNovoUsuario(
  politicas: PoliticaAlvoReconciliacao[],
  setorIdsUsuario: string[],
): PoliticaAlvoReconciliacao[] {
  return politicas.filter(
    (p) => p.setorIds.length === 0 || p.setorIds.some((id) => setorIdsUsuario.includes(id)),
  );
}
```

**Chamada em `convidarUsuario`** (`app/(shell)/admin/actions.ts`), logo
após o `prisma.usuario.create` que já existe hoje:

```ts
try {
  const publicadas = await prisma.politica.findMany({
    where: { estado: "publicada", consorcioId: null },
    include: { audienciaSetores: { select: { id: true } } },
  });
  const alvo: PoliticaAlvoReconciliacao[] = publicadas.map((p) => ({
    id: p.id,
    tipo: p.tipo,
    publicadaEm: p.publicadaEm!,
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
```

Best-effort, mesmo padrão do `criarPendencias`/`notificarAudiencia` já
existentes na publicação: falha aqui NUNCA desfaz nem impede o convite —
só fica sem a pendência retroativa desta vez (mesma filosofia fail-open já
documentada no arquivo de publish).

Sem job assíncrono, sem fila: convite é ação rara de admin (uma pessoa por
vez), e o número de políticas publicadas é modesto (dezenas, não milhares)
— roda inline em milissegundos, mesmo raciocínio de escala já usado em
`notificarAudiencia` (sequencial, não paralelo, porque o volume nunca
justificou complexidade extra).

`revalidatePath` não muda — o convite já revalida `/admin`; o painel do
usuário novo é carregado por ele mesmo, na primeira visita, direto do
banco (`force-dynamic`), sem cache a invalidar.

## Testes

- `politicasParaNovoUsuario`: função pura, testável isolada — casos:
  audiência vazia (sempre inclui), setor bate (inclui), setor não bate
  (exclui), lista de setores vazia do usuário + política com setor restrito
  (exclui).
- `convidarUsuario`: teste de integração confirmando que, após convidar um
  usuário quando já existe política publicada com audiência aberta, uma
  `Pendencia` com `estado: "pendente"` aparece pra esse usuário.

## Fora de escopo (explícito)

- Reconciliação em reativação de usuário.
- Reconciliação em vínculo de setor pós-criação.
- Reconciliação em vínculo de consórcio.
- Qualquer mudança em `resolverAudiencia`/`criarPendencias` do fluxo de
  publish — continuam exatamente como estão.
