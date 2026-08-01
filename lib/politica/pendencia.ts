import type { UsuarioAlvo } from "@/lib/politica/dominio";

export type DadoPendencia = {
  politicaId: string;
  usuarioId: string;
  politicaPublicadaEm: Date;
  tipo: string;
  estado: "pendente";
};

// Regra pura: uma Pendencia por usuário-alvo, todas "pendente", presas à
// mesma publicação (politicaPublicadaEm) — usada por createMany em
// estado-actions.ts. Sem I/O, testável isoladamente.
export function dadosPendencia(
  politicaId: string,
  tipo: string,
  publicadaEm: Date,
  alvos: UsuarioAlvo[],
): DadoPendencia[] {
  return alvos.map((a) => ({
    politicaId,
    usuarioId: a.id,
    politicaPublicadaEm: publicadaEm,
    tipo,
    estado: "pendente" as const,
  }));
}
