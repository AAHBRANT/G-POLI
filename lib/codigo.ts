import { prisma } from "@/lib/prisma";

// Sigla da área para o código normativo. Multi-palavra → iniciais; palavra única → 3 letras.
export function siglaArea(nome: string): string {
  const limpo = nome.trim().replace(/[^A-Za-zÀ-ÿ0-9\s]/g, "");
  const palavras = limpo.split(/\s+/).filter(Boolean);
  let sigla: string;
  if (palavras.length > 1) {
    sigla = palavras.map((p) => p[0]).join("").slice(0, 4);
  } else {
    sigla = (palavras[0] ?? "GER").slice(0, 3);
  }
  return sigla
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Próximo código normativo da área, ex.: POL-RH-001 (sequência por sigla).
export async function gerarCodigoNormativo(areaId: string, areaNome: string): Promise<string> {
  const sigla = siglaArea(areaNome);
  const prefixo = `POL-${sigla}-`;
  const existentes = await prisma.politica.findMany({
    where: { codigo: { startsWith: prefixo } },
    select: { codigo: true },
  });
  let max = 0;
  for (const p of existentes) {
    const n = parseInt((p.codigo ?? "").slice(prefixo.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  const seq = String(max + 1).padStart(3, "0");
  return `${prefixo}${seq}`;
}
