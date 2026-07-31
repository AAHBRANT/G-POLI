"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { leituraValida } from "@/lib/politica/dominio";

export type ResultadoAcao = { ok: boolean; erro?: string };

function ipDoRequest(): string {
  const h = headers();
  const encaminhado = h.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "desconhecido";
}

// Colaborador (qualquer usuário) confirma leitura de uma norma publicada.
// `abertoEm` = ISO timestamp de quando o componente de leitura foi montado
// (enviado pelo cliente) — usado só para a checagem de tempo mínimo acima.
export async function darCiencia(politicaId: string, abertoEm: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!usuario) return { ok: false, erro: "Sessão inválida." };

  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (politica.estado !== "publicada") {
    return { ok: false, erro: "Só é possível dar ciência de normas publicadas." };
  }

  if (!leituraValida(abertoEm, new Date())) {
    return { ok: false, erro: "Aguarde a leitura do documento antes de confirmar." };
  }

  await prisma.ciencia.upsert({
    where: { politicaId_usuarioOid: { politicaId, usuarioOid: usuario.oid } },
    update: {},
    create: {
      politicaId,
      usuarioOid: usuario.oid,
      usuarioNome: usuario.nome,
      usuarioEmail: usuario.email,
      ip: ipDoRequest(),
      politicaPublicadaEm: politica.publicadaEm,
    },
  });
  await prisma.pendencia.updateMany({
    where: { politicaId, usuarioId: usuario.id!, politicaPublicadaEm: politica.publicadaEm!, estado: "pendente" },
    data: { estado: "resolvida", resolvidaEm: new Date() },
  });
  await registrar("ciencia.dar", "Politica", politicaId, politica.titulo);
  revalidatePath(`/catalogo/${politicaId}`);
  return { ok: true };
}
