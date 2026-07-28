"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podeEditarConteudo } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

// Define o público-alvo da notificação de publicação (v3). Mesma alçada de
// editar conteúdo (SGI/admin ou área dona, só em rascunho) — o público-alvo é
// parte do que se decide antes de publicar, não depois.
export async function definirAudiencia(
  politicaId: string,
  setorIds: string[],
  usuarioIds: string[],
): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };
  if (!podeEditarConteudo(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para definir o público-alvo." };
  }

  await prisma.politica.update({
    where: { id: politicaId },
    data: {
      audienciaSetores: { set: setorIds.map((id) => ({ id })) },
      audienciaUsuarios: { set: usuarioIds.map((id) => ({ id })) },
    },
  });
  await registrar(
    "politica.audiencia",
    "Politica",
    politicaId,
    `${setorIds.length} setor(es), ${usuarioIds.length} usuário(s)`,
  );
  revalidatePath(`/catalogo/${politicaId}`);
  return { ok: true };
}
