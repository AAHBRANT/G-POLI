import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

type GroupByResult = Array<{
  tipo: string;
  _count: {
    _all: number;
  };
}>;

export async function GET() {
  const usuario = await getUsuarioAtual();
  if (!usuario || !usuario.id) return new NextResponse(null, { status: 401 });

  const resultado = await prisma.pendencia.groupBy({
    by: ["tipo"],
    where: { usuarioId: usuario.id, estado: "pendente" },
    _count: { _all: true },
  });
  const grupos = resultado as GroupByResult;

  const porTipo: Record<string, number> = {};
  let total = 0;
  for (const g of grupos) {
    porTipo[g.tipo] = g._count._all;
    total += g._count._all;
  }

  return NextResponse.json({ total, porTipo });
}
