"use server";

import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

// Best-effort: o toast já fechou no client independente do resultado aqui.
// `where` combina id (único) + usuarioId — sem isso, um usuário poderia
// marcar como notificada a pendência de outro (IDOR). Se não achar (P2025:
// pendência de outro usuário, ou id inexistente), é no-op silencioso.
export async function marcarPendenciaNotificada(pendenciaId: string): Promise<void> {
  const usuario = await getUsuarioAtual();
  if (!usuario || !usuario.id) return;

  try {
    await prisma.pendencia.update({
      where: { id: pendenciaId, usuarioId: usuario.id },
      data: { notificadaEm: new Date() },
    });
  } catch (erro) {
    console.error("Falha ao marcar pendencia como notificada:", erro);
  }
}
