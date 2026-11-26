import type { UsuarioAlvo } from "@/lib/politica/dominio";
import { podeVerDocumento, type Classificacao } from "@/lib/auth/rbac";

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
  classificacao: Classificacao;
  areaId: string; // setor dono
  setorIds: string[]; // ids de audienciaSetores desta política
  usuarioIds: string[]; // ids de audienciaUsuarios — audiência "aberta a todos" exige setor E usuário vazios
};

// Filtra, entre políticas publicadas SEM consórcio, quais um usuário recém-criado
// (que ainda não é nominal em nenhum público-alvo) pode ver pelas regras de
// visibilidade — inclusive a classificação: restrito só se ele for do setor dono
// ou de um setor do público-alvo; confidencial nunca (só nominais). Usada pela
// reconciliação de pendência retroativa (lib/politica/reconciliarPendencias.ts)
// quando um usuário nasce depois da política já publicada.
export function politicasParaNovoUsuario(
  politicas: PoliticaAlvoReconciliacao[],
  setorIdsUsuario: string[],
): PoliticaAlvoReconciliacao[] {
  const novo = {
    id: null,
    oid: "",
    nome: "",
    email: "",
    perfil: "colaborador" as const,
    setores: setorIdsUsuario,
    consorcios: [],
  };
  return politicas.filter((p) =>
    podeVerDocumento(novo, {
      estado: "publicada",
      classificacao: p.classificacao,
      areaId: p.areaId,
      consorcioId: null,
      audienciaSetorIds: p.setorIds,
      audienciaUsuarioIds: p.usuarioIds,
    }),
  );
}
