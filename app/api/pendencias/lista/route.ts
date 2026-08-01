import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

export type ItemPendencia = {
  id: string;
  politicaId: string;
  titulo: string;
  codigo: string | null;
  tipo: string;
  publicadaEm: string;
  criadaEm: string;
  notificadaEm: string | null;
};

export async function GET() {
  const usuario = await getUsuarioAtual();
  if (!usuario || !usuario.id) return new NextResponse(null, { status: 401 });

  const pendencias = await prisma.pendencia.findMany({
    where: { usuarioId: usuario.id, estado: "pendente" },
    include: { politica: { select: { titulo: true, codigo: true } } },
    orderBy: { criadaEm: "desc" },
    take: 20,
  });

  const itens: ItemPendencia[] = pendencias.map((p) => ({
    id: p.id,
    politicaId: p.politicaId,
    titulo: p.politica.titulo,
    codigo: p.politica.codigo,
    tipo: p.tipo,
    publicadaEm: p.politicaPublicadaEm.toISOString(),
    criadaEm: p.criadaEm.toISOString(),
    notificadaEm: p.notificadaEm ? p.notificadaEm.toISOString() : null,
  }));

  return NextResponse.json({ itens });
}
