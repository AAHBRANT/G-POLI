import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizadoCron } from "@/lib/cron/secret";
import { lembretesPendentes, type MarcoLembrete } from "@/lib/politica/lembretesPendentes";
import { enviarNotificacaoLembretePendencia, enviarResumoPendenciasSgi } from "@/lib/notificacao/graph";

export const dynamic = "force-dynamic";

function campoDoMarco(marco: MarcoLembrete): "lembrete3EnviadoEm" | "lembrete7EnviadoEm" | "lembrete15EnviadoEm" {
  if (marco === 3) return "lembrete3EnviadoEm";
  if (marco === 7) return "lembrete7EnviadoEm";
  return "lembrete15EnviadoEm";
}

export async function POST(request: Request) {
  if (!autorizadoCron(request.headers.get("authorization"))) {
    return new NextResponse("Não autorizado", { status: 401 });
  }

  const agora = new Date();
  const pendentes = await prisma.pendencia.findMany({
    where: { estado: "pendente" },
    include: { politica: { select: { titulo: true } }, usuario: { select: { oid: true } } },
  });

  let enviados = 0;
  let falhas = 0;
  const cruzaramQuinzeDias: string[] = [];

  for (const p of pendentes) {
    const marcos = lembretesPendentes(p, agora);
    if (marcos.length === 0) continue;
    if (!p.usuario.oid) continue; // nunca logou — sem oid não há como notificar via Teams

    for (const marco of marcos) {
      const resultado = await enviarNotificacaoLembretePendencia({
        oid: p.usuario.oid,
        tituloPolitica: p.politica.titulo,
        politicaId: p.politicaId,
        diasPendente: marco,
      });

      if (resultado.ok) {
        enviados++;
        await prisma.pendencia.update({ where: { id: p.id }, data: { [campoDoMarco(marco)]: agora } });
        if (marco === 15) cruzaramQuinzeDias.push(p.id);
      } else {
        falhas++;
        console.error(`Falha ao enviar lembrete (marco ${marco}) pendencia ${p.id}:`, resultado.motivo);
      }
    }
  }

  let resumoSgi = 0;
  if (cruzaramQuinzeDias.length > 0) {
    const sgi = await prisma.usuario.findMany({
      where: { perfil: "sgi", ativo: true, oid: { not: null } },
      select: { oid: true },
    });
    const oidsSgi = sgi.map((u) => u.oid).filter((oid): oid is string => Boolean(oid));
    if (oidsSgi.length > 0) {
      await enviarResumoPendenciasSgi({ oidsSgi, quantidade: cruzaramQuinzeDias.length });
      resumoSgi = cruzaramQuinzeDias.length;
    }
  }

  return NextResponse.json({ ok: true, enviados, falhas, resumoSgi });
}
