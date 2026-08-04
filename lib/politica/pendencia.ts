import { audienciaVazia, type UsuarioAlvo } from "@/lib/politica/dominio";

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

export type PoliticaAlvoReconciliacao = {
  id: string;
  tipo: string;
  publicadaEm: Date;
  setorIds: string[]; // ids de audienciaSetores desta política
  usuarioIds: string[]; // ids de audienciaUsuarios — audiência "aberta a todos" exige setor E usuário vazios
};

// Filtra, entre políticas publicadas SEM consórcio, quais valem pro usuário
// recém-criado: audiência vazia (aberta a todos, via audienciaVazia — mesma
// regra usada no resto do sistema) OU algum setor do convite bate com
// audienciaSetores da política. Espelha audienciaVazia/unirAudiencia
// (lib/politica/dominio.ts), só que na direção inversa (usuário → políticas,
// não política → usuários) — usada pela reconciliação de pendência retroativa
// (lib/politica/reconciliarPendencias.ts) quando um usuário nasce depois da
// política já publicada.
export function politicasParaNovoUsuario(
  politicas: PoliticaAlvoReconciliacao[],
  setorIdsUsuario: string[],
): PoliticaAlvoReconciliacao[] {
  return politicas.filter(
    (p) =>
      audienciaVazia(p.setorIds, p.usuarioIds) ||
      p.setorIds.some((id) => setorIdsUsuario.includes(id)),
  );
}
