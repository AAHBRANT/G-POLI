"use server";

import path from "path";
import { prisma } from "@/lib/prisma";
import { salvarArquivo } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podeEditarConteudo } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";

export type ResultadoAcao = { ok: boolean; erro?: string };

const TIPOS_PERMITIDOS = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"];
const TAMANHO_MAX = 25 * 1024 * 1024; // 25 MB

export async function adicionarVersao(
  politicaId: string,
  formData: FormData,
): Promise<ResultadoAcao> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione um arquivo." };
  }
  if (arquivo.size > TAMANHO_MAX) {
    return { ok: false, erro: "Arquivo acima de 25 MB." };
  }
  const ext = path.extname(arquivo.name).toLowerCase();
  if (!TIPOS_PERMITIDOS.includes(ext)) {
    return { ok: false, erro: `Tipo não permitido (${ext || "sem extensão"}).` };
  }

  const politica = await prisma.politica.findUnique({ where: { id: politicaId } });
  if (!politica) return { ok: false, erro: "Política não encontrada." };

  const usuario = await getUsuarioAtual();
  if (!podeEditarConteudo(usuario, politica)) {
    return { ok: false, erro: "Sem permissão para enviar versão nesta política." };
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());

  try {
    const salvo = await salvarArquivo(politicaId, arquivo.name, bytes);

    await prisma.$transaction(async (tx) => {
      const totais = await tx.versao.count({ where: { politicaId } });
      // Versão anterior deixa de ser a ativa.
      await tx.versao.updateMany({
        where: { politicaId, estado: "ativa" },
        data: { estado: "substituida" },
      });
      await tx.versao.create({
        data: {
          politicaId,
          numero: totais + 1,
          estado: "ativa",
          documento: {
            create: {
              nome: arquivo.name,
              tipo: arquivo.type || ext.replace(".", ""),
              tamanho: salvo.tamanho,
              hash: salvo.hash,
              estado: "importado",
            },
          },
        },
      });
    });
  } catch (e: unknown) {
    const dup =
      e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
    return {
      ok: false,
      erro: dup
        ? "Documento idêntico já cadastrado (mesmo hash)."
        : "Falha ao salvar o documento.",
    };
  }

  await registrar("versao.upload", "Politica", politicaId, arquivo.name);
  revalidatePath(`/catalogo/${politicaId}`);
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
