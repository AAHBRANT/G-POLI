import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, filtroVisibilidade } from "@/lib/auth/usuario";
import type { TipoDocumentoValor } from "@/lib/constants";
import MetricasCatalogo from "./MetricasCatalogo";
import FiltrosCatalogo from "./FiltrosCatalogo";
import CatalogoTabela from "./CatalogoTabela";

// Bloco compartilhado por /catalogo e /tipos/[tipo]: cards de métrica +
// filtros + tabela. Os cards de métrica mostram o total do TIPO inteiro
// (ignoram os filtros ativos — são visão geral, não resultado filtrado);
// a tabela abaixo aplica busca/setor/status. Os dois respeitam a mesma
// visibilidade por perfil das listagens (PR #37) — sem isso, os números
// dos cards vazariam contagem de política de outro setor pro colaborador.
export default async function PainelCatalogo({
  tipo,
  action,
  q,
  areaId,
  estado,
  mensagemVazio,
}: {
  tipo: TipoDocumentoValor;
  action: string;
  q: string;
  areaId: string;
  estado: string;
  mensagemVazio: ReactNode;
}) {
  const usuario = await getUsuarioAtual();
  const visibilidade = filtroVisibilidade(usuario);

  const and: Record<string, unknown>[] = [{ tipo }, visibilidade];
  if (areaId) and.push({ areaId });
  if (estado) and.push({ estado });
  if (q) {
    and.push({
      OR: [
        { titulo: { contains: q, mode: "insensitive" } },
        { codigo: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const [total, publicadas, revogadas, areas, itens] = await Promise.all([
    prisma.politica.count({ where: { AND: [{ tipo }, visibilidade] } }),
    prisma.politica.count({ where: { AND: [{ tipo }, visibilidade, { estado: "publicada" }] } }),
    prisma.politica.count({ where: { AND: [{ tipo }, visibilidade, { estado: "revogada" }] } }),
    prisma.area.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.politica.findMany({
      where: { AND: and },
      include: { area: true, _count: { select: { versoes: true } } },
      orderBy: { criadaEm: "desc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <MetricasCatalogo total={total} publicadas={publicadas} revogadas={revogadas} />
      <FiltrosCatalogo
        action={action}
        areas={areas.map((a) => ({ id: a.id, nome: a.nome }))}
        q={q}
        areaId={areaId}
        estado={estado}
      />
      {itens.length === 0 ? mensagemVazio : <CatalogoTabela itens={itens} />}
    </div>
  );
}
