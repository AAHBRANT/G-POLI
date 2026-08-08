// Backfill pontual (Bug: pendência não criada pra usuário criado/ativado
// DEPOIS de uma política já publicada — ver docs/DEPLOY.md).
//
// Só ADICIONA Pendencia faltante (createMany + skipDuplicates na constraint
// única politicaId+usuarioId+politicaPublicadaEm) — nunca cancela, atualiza
// ou apaga nada existente. Reversível: os ids criados são logados no final;
// pra desfazer, DELETE FROM "Pendencia" WHERE id IN (...) com essa lista.
//
// Rodar: node scripts/backfill-pendencias.js
// (usa a DATABASE_URL do .env do ambiente-alvo — hml ou prod; puxe o .env
// correto antes de rodar, ou exporte DATABASE_URL na sessão)
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function paraAlvo(u) {
  return { id: u.id, oid: u.oid, nome: u.nome, email: u.email };
}

// Réplica pura de lib/politica/dominio.ts (audienciaVazia/unirAudiencia) e
// lib/politica/pendencia.ts (dadosPendencia) — duplicado aqui só pra este
// script pontual rodar sem depender de ts-node/tsx.
function audienciaVazia(setorIds, usuarioIds) {
  return setorIds.length === 0 && usuarioIds.length === 0;
}

function unirAudiencia(porSetor, individuais) {
  const mapa = new Map();
  for (const u of [...porSetor, ...individuais]) mapa.set(u.id, u);
  return [...mapa.values()];
}

function dadosPendencia(politicaId, tipo, publicadaEm, alvos) {
  return alvos.map((a) => ({
    politicaId,
    usuarioId: a.id,
    politicaPublicadaEm: publicadaEm,
    tipo,
    estado: "pendente",
  }));
}

// Réplica de resolverAudiencia (app/(shell)/catalogo/[id]/estado-actions.ts) —
// não pode importar de lá (arquivo "use server").
async function resolverAudiencia(politicaId, consorcioId) {
  if (consorcioId) {
    const consorcio = await prisma.consorcio.findUnique({
      where: { id: consorcioId },
      include: { membros: { where: { ativo: true } } },
    });
    return (consorcio?.membros ?? []).map(paraAlvo);
  }

  const politica = await prisma.politica.findUnique({
    where: { id: politicaId },
    include: {
      audienciaSetores: { include: { membros: { where: { ativo: true } } } },
      audienciaUsuarios: { where: { ativo: true } },
    },
  });
  if (!politica) return [];

  const setorIds = politica.audienciaSetores.map((a) => a.id);
  const usuarioIds = politica.audienciaUsuarios.map((u) => u.id);

  return audienciaVazia(setorIds, usuarioIds)
    ? (await prisma.usuario.findMany({ where: { ativo: true } })).map(paraAlvo)
    : unirAudiencia(
        politica.audienciaSetores.flatMap((a) => a.membros).map(paraAlvo),
        politica.audienciaUsuarios.map(paraAlvo),
      );
}

async function main() {
  const politicas = await prisma.politica.findMany({
    where: { estado: "publicada" },
    select: { id: true, titulo: true, tipo: true, publicadaEm: true, consorcioId: true },
  });

  let totalCriadas = 0;
  const idsCriados = [];

  for (const politica of politicas) {
    if (!politica.publicadaEm) continue;

    const alvos = await resolverAudiencia(politica.id, politica.consorcioId);
    if (alvos.length === 0) continue;

    const linhas = dadosPendencia(politica.id, politica.tipo, politica.publicadaEm, alvos);

    const antes = await prisma.pendencia.count({ where: { politicaId: politica.id } });
    await prisma.pendencia.createMany({ data: linhas, skipDuplicates: true });
    const depois = await prisma.pendencia.count({ where: { politicaId: politica.id } });
    const criadasAqui = depois - antes;

    if (criadasAqui > 0) {
      const novas = await prisma.pendencia.findMany({
        where: { politicaId: politica.id, politicaPublicadaEm: politica.publicadaEm },
        orderBy: { criadaEm: "desc" },
        take: criadasAqui,
        select: { id: true },
      });
      idsCriados.push(...novas.map((n) => n.id));
      totalCriadas += criadasAqui;
      console.log(`"${politica.titulo}": +${criadasAqui} pendência(s) criada(s)`);
    }
  }

  console.log(`\nTotal: ${totalCriadas} pendência(s) criada(s) em ${politicas.length} política(s) verificada(s).`);
  if (idsCriados.length > 0) {
    console.log("IDs criados (guarde pra reverter se precisar):");
    console.log(JSON.stringify(idsCriados));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
