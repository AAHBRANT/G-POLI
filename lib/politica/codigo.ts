import { prisma } from "@/lib/prisma";
import { siglaArea, proximoSequencialArea, formatarCodigoNormativo } from "@/lib/politica/dominio";
import { tipoDocumento, type TipoDocumentoValor } from "@/lib/constants";

// Reexporta a regra pura (compatibilidade com quem importava daqui).
export { siglaArea };

// Próximo código normativo, no padrão oficial AHBT-TD-AR-SEQ (planilha
// Codificação de Documentos, "Gerador de Código", conferida em 2026-07-30).
// SEQ é por ÁREA (AR), não por tipo+área: Política, Procedimento e Instrução
// da mesma área compartilham a mesma sequência — por isso a busca é por
// `areaId`, e não por um prefixo tipo+sigla.
export async function gerarCodigoNormativo(
  areaId: string,
  areaNome: string,
  tipo: TipoDocumentoValor = "politica",
): Promise<string> {
  const sigla = siglaArea(areaNome);
  const prefixoTipo = tipoDocumento(tipo).prefixo;
  const existentes = await prisma.politica.findMany({
    where: { areaId },
    select: { codigo: true },
  });
  const seq = proximoSequencialArea(existentes.map((p) => p.codigo));
  return formatarCodigoNormativo(sigla, seq, prefixoTipo);
}
