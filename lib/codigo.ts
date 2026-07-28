import { prisma } from "@/lib/prisma";
import { siglaArea, proximoSequencial, formatarCodigoNormativo } from "@/lib/dominio";
import { tipoDocumento, type TipoDocumentoValor } from "@/lib/constants";

// Reexporta a regra pura (compatibilidade com quem importava daqui).
export { siglaArea };

// Próximo código normativo da área, ex.: POL-RH-001 (sequência por sigla).
// v3: o prefixo vem do tipo de documento (Política=POL, Norma=NOR...) — a
// sequência é isolada por prefixo+área, então tipos diferentes na mesma área
// não competem pelo mesmo número.
export async function gerarCodigoNormativo(
  areaId: string,
  areaNome: string,
  tipo: TipoDocumentoValor = "politica",
): Promise<string> {
  const sigla = siglaArea(areaNome);
  const prefixoTipo = tipoDocumento(tipo).prefixo;
  const prefixo = `${prefixoTipo}-${sigla}-`;
  const existentes = await prisma.politica.findMany({
    where: { codigo: { startsWith: prefixo } },
    select: { codigo: true },
  });
  const seq = proximoSequencial(prefixo, existentes.map((p) => p.codigo));
  return formatarCodigoNormativo(sigla, seq, prefixoTipo);
}
