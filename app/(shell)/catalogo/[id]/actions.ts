"use server";

import path from "path";
import { prisma } from "@/lib/prisma";
import { salvarArquivo } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { getUsuarioAtual, podeEditarConteudo } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { validarUpload, proximoNumeroVersao } from "@/lib/politica/dominio";

export type ResultadoAcao = { ok: boolean; erro?: string };

export async function adicionarVersao(
  politicaId: string,
  formData: FormData,
): Promise<ResultadoAcao> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione um arquivo." };
  }
  const validacao = validarUpload(arquivo.name, arquivo.size);
  if (!validacao.ok) {
    return { ok: false, erro: validacao.erro };
  }
  const ext = path.extname(arquivo.name).toLowerCase();

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
      // Anexo manual (planilha, formulário de apoio) NÃO substitui nada —
      // múltiplos anexos convivem. Só o documento oficial (gerado
      // automaticamente na publicação) usa "substituida" — ver
      // publicarPolitica em estado-actions.ts.
      await tx.versao.create({
        data: {
          politicaId,
          numero: proximoNumeroVersao(totais),
          estado: "ativa",
          documento: {
            create: {
              nome: arquivo.name,
              tipo: arquivo.type || ext.replace(".", ""),
              tamanho: salvo.tamanho,
              hash: salvo.hash,
              estado: "importado",
              oficial: false,
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
