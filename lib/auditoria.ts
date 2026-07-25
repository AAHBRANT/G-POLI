import { prisma } from "@/lib/prisma";
import { getUsuarioAtual } from "@/lib/auth/usuario";

// Registra uma ação na trilha de auditoria (#3c). Nunca lança — auditoria não deve
// derrubar a operação principal; falhas são engolidas silenciosamente.
export async function registrar(
  acao: string,
  entidade: string,
  entidadeId: string,
  detalhe = "",
): Promise<void> {
  try {
    const u = await getUsuarioAtual();
    await prisma.auditoria.create({
      data: {
        usuarioEmail: u?.email ?? "desconhecido",
        usuarioNome: u?.nome ?? "",
        perfil: u?.perfil ?? "",
        acao,
        entidade,
        entidadeId,
        detalhe,
      },
    });
  } catch {
    // silencioso de propósito
  }
}
