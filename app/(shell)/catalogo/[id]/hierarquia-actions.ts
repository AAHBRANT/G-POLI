"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, filtroVisibilidade, podeGerirVinculos } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { validarSuperior } from "@/lib/politica/hierarquia";
import { calcularProximaRevisao, periodicidadeValida } from "@/lib/politica/revisao";
import type { TipoDocumentoValor } from "@/lib/constants";

export type ResultadoAcao = { ok: boolean; erro?: string };

// Define (ou remove, com paiId = null) o documento superior. É metadado: não
// altera o texto oficial, então SGI/admin podem ajustar mesmo com o documento
// publicado; o Gestor de Setor dono só em rascunho (ver podeGerirVinculos).
// O superior escolhido precisa ser visível para quem está definindo e de um tipo
// permitido (lib/politica/hierarquia.ts).
export async function definirSuperior(politicaId: string, paiId: string | null): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Documento não encontrado." };
  if (!podeGerirVinculos(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para definir o documento superior." };
  }

  let descricao = "removeu o documento superior";
  if (paiId) {
    const pai = await prisma.politica.findFirst({
      where: { id: paiId, AND: [filtroVisibilidade(usuario)] },
      select: { id: true, tipo: true, codigo: true, titulo: true },
    });
    if (!pai) return { ok: false, erro: "Documento superior não encontrado." };
    const v = validarSuperior(
      { id: politica.id, tipo: politica.tipo as TipoDocumentoValor },
      { id: pai.id, tipo: pai.tipo as TipoDocumentoValor },
    );
    if (!v.ok) return { ok: false, erro: v.erro };
    descricao = `superior: ${pai.codigo ?? pai.titulo}`;
  }

  await prisma.politica.update({ where: { id: politicaId }, data: { paiId } });
  await registrar("politica.superior", "Politica", politicaId, descricao);
  revalidatePath(`/catalogo/${politicaId}`);
  return { ok: true };
}

// Ajusta a periodicidade de revisão (em meses). Se o documento já está publicado,
// recalcula a próxima revisão a partir da data de publicação.
export async function definirPrazoRevisao(politicaId: string, meses: number): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Documento não encontrado." };
  if (!podeGerirVinculos(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para definir o prazo de revisão." };
  }
  if (!periodicidadeValida(meses)) {
    return { ok: false, erro: "Periodicidade inválida (use de 1 a 60 meses)." };
  }

  const proxima =
    politica.estado === "publicada" && politica.publicadaEm
      ? calcularProximaRevisao(politica.publicadaEm, meses)
      : politica.proximaRevisaoEm;

  await prisma.politica.update({
    where: { id: politicaId },
    data: { periodicidadeRevisaoMeses: meses, proximaRevisaoEm: proxima },
  });
  await registrar("politica.prazo", "Politica", politicaId, `revisão a cada ${meses} meses`);
  revalidatePath(`/catalogo/${politicaId}`);
  return { ok: true };
}
