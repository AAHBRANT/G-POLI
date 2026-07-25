"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

// Colaborador (qualquer usuário) confirma leitura de uma norma publicada.
export async function darCiencia(politicaId: string): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!usuario) return { ok: false, erro: "Sessão inválida." };

  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (politica.estado !== "publicada") {
    return { ok: false, erro: "Só é possível dar ciência de normas publicadas." };
  }

  await prisma.ciencia.upsert({
    where: { politicaId_usuarioOid: { politicaId, usuarioOid: usuario.oid } },
    update: {},
    create: {
      politicaId,
      usuarioOid: usuario.oid,
      usuarioNome: usuario.nome,
      usuarioEmail: usuario.email,
    },
  });
  await registrar("ciencia.dar", "Politica", politicaId, politica.titulo);
  revalidatePath(`/catalogo/${politicaId}`);
  return { ok: true };
}
