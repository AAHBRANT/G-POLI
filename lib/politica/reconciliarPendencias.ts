import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { dadosPendencia, politicasParaNovoUsuario, type PoliticaAlvoReconciliacao } from "@/lib/politica/pendencia";

// Best-effort (mesma filosofia de criarPendencias/notificarAudiencia em
// app/(shell)/catalogo/[id]/estado-actions.ts): chamada pelo convite manual
// (convidarUsuario) E pelo auto-provisionamento no primeiro login
// (provisionarUsuario) — os dois jeitos de um Usuario nascer no sistema.
// Falha aqui NUNCA pode desfazer ou impedir a criação do usuário já commitada.
export async function reconciliarPendenciasNovoUsuario(
  usuario: { id: string; oid: string | null; nome: string; email: string },
  setorIds: string[],
): Promise<void> {
  try {
    const publicadas = await prisma.politica.findMany({
      where: { estado: "publicada", consorcioId: null },
      select: {
        id: true,
        tipo: true,
        publicadaEm: true,
        audienciaSetores: { select: { id: true } },
        audienciaUsuarios: { select: { id: true } },
      },
    });
    const alvo: PoliticaAlvoReconciliacao[] = publicadas
      .filter((p) => p.publicadaEm)
      .map((p) => ({
        id: p.id,
        tipo: p.tipo,
        publicadaEm: p.publicadaEm as Date,
        setorIds: p.audienciaSetores.map((s) => s.id),
        usuarioIds: p.audienciaUsuarios.map((u) => u.id),
      }));
    const relevantes = politicasParaNovoUsuario(alvo, setorIds);
    const linhas = relevantes.flatMap((p) =>
      dadosPendencia(p.id, p.tipo, p.publicadaEm, [
        { id: usuario.id, oid: usuario.oid, nome: usuario.nome, email: usuario.email },
      ]),
    );
    if (linhas.length > 0) {
      await prisma.pendencia.createMany({
        data: linhas as Prisma.PendenciaCreateManyInput[],
        skipDuplicates: true,
      });
    }
  } catch (erro) {
    console.error("Falha ao reconciliar pendencias do novo usuário (criação já confirmada):", erro);
  }
}
