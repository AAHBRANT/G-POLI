import { prisma } from "@/lib/prisma";
import { siglaArea, proximoSequencial, formatarCodigoNormativo } from "@/lib/dominio";

// Reexporta a regra pura (compatibilidade com quem importava daqui).
export { siglaArea };

// Próximo código normativo da área, ex.: POL-RH-001 (sequência por sigla).
export async function gerarCodigoNormativo(areaId: string, areaNome: string): Promise<string> {
  const sigla = siglaArea(areaNome);
  const prefixo = `POL-${sigla}-`;
  const existentes = await prisma.politica.findMany({
    where: { codigo: { startsWith: prefixo } },
    select: { codigo: true },
  });
  const seq = proximoSequencial(prefixo, existentes.map((p) => p.codigo));
  return formatarCodigoNormativo(sigla, seq);
}
