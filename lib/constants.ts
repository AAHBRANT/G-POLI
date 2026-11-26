// v3: categorias de documento do PRODUTO (menu lateral). O `prefixo` é a
// sigla oficial de Tipo de Documento (TD) do SGI onde existe — tabela "Tipos
// de Documento" da planilha Codificação de Documentos (Tabelas de Apoio).
// "Norma" (NOR) e "Código" (COD) foram removidos em 2026-07-30 por não terem
// TD oficial correspondente na tabela do SGI, e restaurados em 2026-08-03 a
// pedido do usuário — aceitando conscientemente que esses 2 códigos ficam
// fora do padrão oficial ORG-TD-AR-SEQ-REV até o SGI confirmar uma sigla.
// `comunicado_normativo` fica como está (prefixo interno "CN") — o TD oficial
// mais próximo é o Comunicado Interno (CI), mas ele usa um formato de código
// totalmente diferente (UNIDADE | CI-NNN | ANO, não ORG-TD-AR-SEQ) que
// decidimos não implementar por ora.
export const TIPOS_DOCUMENTO = [
  {
    valor: "politica",
    rotulo: "Política",
    rotuloPlural: "Políticas",
    genero: "f",
    descricao: "Define diretrizes gerais.",
    exemplo: "Política de Segurança da Informação",
    prefixo: "POL",
  },
  {
    valor: "norma",
    rotulo: "Norma",
    rotuloPlural: "Normas",
    genero: "f",
    descricao: "Define regra obrigatória mais específica.",
    exemplo: "Norma de Uso de E-mail Corporativo",
    prefixo: "NOR",
  },
  {
    valor: "procedimento",
    rotulo: "Procedimento",
    rotuloPlural: "Procedimentos",
    genero: "m",
    descricao: "Define passo a passo operacional.",
    exemplo: "Procedimento para Solicitação de Reembolso",
    prefixo: "PRO",
  },
  {
    valor: "instrucao_trabalho",
    rotulo: "Instrução de Trabalho",
    rotuloPlural: "Instruções de Trabalho",
    genero: "f",
    descricao: "Define execução detalhada de uma tarefa.",
    exemplo: "Instrução para abertura de chamado de TI",
    prefixo: "IT",
  },
  {
    valor: "manual",
    rotulo: "Manual",
    rotuloPlural: "Manuais",
    genero: "m",
    descricao: "Reúne orientações amplas.",
    exemplo: "Manual do Colaborador",
    prefixo: "MAN",
  },
  {
    valor: "codigo",
    rotulo: "Código",
    rotuloPlural: "Códigos",
    genero: "m",
    descricao: "Define princípios e condutas.",
    exemplo: "Código de Ética e Conduta",
    prefixo: "COD",
  },
  {
    valor: "formulario",
    rotulo: "Formulário",
    rotuloPlural: "Formulários",
    genero: "m",
    descricao: "Documento preenchível usado como evidência.",
    exemplo: "Formulário de Solicitação de Viagem",
    prefixo: "FOR",
  },
  {
    valor: "comunicado_normativo",
    rotulo: "Comunicado Normativo",
    rotuloPlural: "Comunicados Normativos",
    genero: "m",
    descricao: "Comunicação oficial com efeito temporário ou imediato.",
    exemplo: "Comunicado sobre nova regra de ponto",
    prefixo: "CN",
  },
] as const;

export type TipoDocumentoValor = (typeof TIPOS_DOCUMENTO)[number]["valor"];

export function tipoDocumentoValido(valor: string): valor is TipoDocumentoValor {
  return TIPOS_DOCUMENTO.some((t) => t.valor === valor);
}

export function tipoDocumento(valor: string) {
  return TIPOS_DOCUMENTO.find((t) => t.valor === valor) ?? TIPOS_DOCUMENTO[0];
}

// Artigo/terminação corretos por gênero — evita "Nova Procedimento" ou "Novo
// Instrução de Trabalho". Chame com o resultado de tipoDocumento(valor).
export function artigoDocumento(info: { genero: "m" | "f" }) {
  return info.genero === "f"
    ? { artigo: "a", novo: "Nova", nenhum: "Nenhuma", cadastrada: "cadastrada" }
    : { artigo: "o", novo: "Novo", nenhum: "Nenhum", cadastrada: "cadastrado" };
}

export const CLASSIFICACOES = [
  {
    valor: "publico_interno",
    rotulo: "Público interno",
    cor: "bg-emerald-100 text-emerald-800",
    explicacao: "Todos os colaboradores veem (ou só o público-alvo, se você definir um).",
  },
  {
    valor: "restrito",
    rotulo: "Restrito",
    cor: "bg-amber-100 text-amber-800",
    explicacao: "Só o setor dono do documento, os setores e as pessoas do público-alvo. Sem público-alvo, só o setor dono.",
  },
  {
    valor: "confidencial",
    rotulo: "Confidencial",
    cor: "bg-red-100 text-red-800",
    explicacao: "Só as pessoas listadas nominalmente no público-alvo, a gestão e o Gestor do setor dono. Setor listado não basta.",
  },
] as const;

export function explicacaoClassificacao(valor: string): string {
  return CLASSIFICACOES.find((c) => c.valor === valor)?.explicacao ?? "";
}

export const ESTADOS_POLITICA: Record<string, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "bg-black/10 text-black/70" },
  // Sprint 4/5/6: fluxo de aprovação Gestor → Diretoria.
  em_aprovacao_gestor: { rotulo: "Aguardando Gestor", cor: "bg-amber-100 text-amber-800" },
  em_aprovacao_diretoria: { rotulo: "Aguardando Diretoria", cor: "bg-amber-100 text-amber-900" },
  publicada: { rotulo: "Publicada", cor: "bg-emerald-100 text-emerald-800" },
  revogada: { rotulo: "Revogada", cor: "bg-red-100 text-red-800" },
};

export function rotuloClassificacao(valor: string): string {
  return CLASSIFICACOES.find((c) => c.valor === valor)?.rotulo ?? valor;
}

export function corClassificacao(valor: string): string {
  return CLASSIFICACOES.find((c) => c.valor === valor)?.cor ?? "bg-black/10 text-black/70";
}
