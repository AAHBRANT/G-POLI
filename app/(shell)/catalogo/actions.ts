"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ESQUELETO_PADRAO } from "@/lib/esqueleto";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { registrar } from "@/lib/auditoria";
import { gerarCodigoNormativo } from "@/lib/codigo";

const CLASSIFICACOES_VALIDAS = ["publico_interno", "restrito", "confidencial"] as const;

export type ResultadoAcao = { ok: boolean; erro?: string };

export async function criarPolitica(formData: FormData): Promise<ResultadoAcao> {
  const usuario = await getUsuarioAtual();
  if (!podeCriarPolitica(usuario)) {
    return { ok: false, erro: "Sem permissão para criar política (apenas SGI/admin)." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const classificacao = String(formData.get("classificacao") ?? "").trim();

  if (!titulo) return { ok: false, erro: "Informe o título da política." };
  if (!area) return { ok: false, erro: "Informe a área responsável." };
  if (!CLASSIFICACOES_VALIDAS.includes(classificacao as never)) {
    return { ok: false, erro: "Classificação inválida." };
  }

  try {
    const areaRegistro = await prisma.area.upsert({
      where: { nome: area },
      update: {},
      create: { nome: area },
    });

    const codigo = await gerarCodigoNormativo(areaRegistro.id, areaRegistro.nome);

    // Nasce com o esqueleto de Política do Manual do SGI (cap. 16.1).
    const nova = await prisma.politica.create({
      data: {
        titulo,
        codigo,
        areaId: areaRegistro.id,
        classificacao: classificacao as never,
        secoes: {
          create: ESQUELETO_PADRAO.map((s) => ({
            ordem: s.ordem,
            codigo: s.codigo,
            titulo: s.titulo,
            tipo: s.tipo,
            colunas: s.colunas ?? undefined,
            linhas: s.tipo === "tabela" ? [] : undefined,
          })),
        },
      },
    });
    await registrar("politica.criar", "Politica", nova.id, `${titulo} (${area})`);
  } catch (e: unknown) {
    // Violação de unicidade (título+área) ou outro erro do banco
    const msg =
      e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
        ? "Já existe uma política com esse título nessa área."
        : "Falha ao salvar. Verifique a conexão com o banco.";
    return { ok: false, erro: msg };
  }

  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
