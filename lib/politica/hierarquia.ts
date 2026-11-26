import type { TipoDocumentoValor } from "@/lib/constants";

// Hierarquia documental (etapa 2 da base para a IA): cada documento pode ter um
// "documento superior" — o que o fundamenta. É a base do agente de Conformidade
// (um procedimento é conferido contra a política acima dele) e da varredura de
// documentos órfãos.
//
//   Política ─┬─ Norma ─── Procedimento ─┬─ Instrução de Trabalho ─ Formulário
//             ├─ Procedimento            └─ Formulário
//             ├─ Manual
//             └─ Comunicado normativo
//   Código: topo (sem superior).
//
// Regras (decisão de projeto, ajustável aqui num lugar só):

/** Tipos que podem ser o superior de cada tipo. Lista vazia = documento de topo. */
export const SUPERIORES_PERMITIDOS: Record<TipoDocumentoValor, TipoDocumentoValor[]> = {
  politica: [],
  codigo: [],
  norma: ["politica"],
  procedimento: ["politica", "norma"],
  instrucao_trabalho: ["procedimento"],
  formulario: ["procedimento", "instrucao_trabalho"],
  manual: ["politica"],
  comunicado_normativo: ["politica", "norma", "procedimento"],
};

/** Tipos que DEVEM ter superior; sem ele o documento é "órfão" (alerta para o SGI). */
const EXIGEM_SUPERIOR: TipoDocumentoValor[] = ["norma", "procedimento", "instrucao_trabalho", "formulario"];

/** Tipos que exigem superior (para filtrar órfãos no banco). */
export function tiposQueExigemSuperior(): TipoDocumentoValor[] {
  return [...EXIGEM_SUPERIOR];
}

export function aceitaSuperior(tipo: TipoDocumentoValor): boolean {
  return SUPERIORES_PERMITIDOS[tipo].length > 0;
}

export function exigeSuperior(tipo: TipoDocumentoValor): boolean {
  return EXIGEM_SUPERIOR.includes(tipo);
}

/** O documento é órfão quando o tipo exige superior e não há nenhum. */
export function ehOrfao(tipo: TipoDocumentoValor, paiId: string | null): boolean {
  return exigeSuperior(tipo) && !paiId;
}

export type ResultadoSuperior = { ok: true } | { ok: false; erro: string };

/**
 * Valida a escolha de um superior. Os tipos formam uma ordem sem ciclos, então
 * basta impedir o documento de ser superior de si mesmo e conferir o tipo.
 */
export function validarSuperior(
  filho: { id: string; tipo: TipoDocumentoValor },
  pai: { id: string; tipo: TipoDocumentoValor },
): ResultadoSuperior {
  if (filho.id === pai.id) return { ok: false, erro: "Um documento não pode ser superior de si mesmo." };
  if (!aceitaSuperior(filho.tipo)) {
    return { ok: false, erro: "Este tipo de documento não tem documento superior." };
  }
  if (!SUPERIORES_PERMITIDOS[filho.tipo].includes(pai.tipo)) {
    return { ok: false, erro: "O documento superior escolhido não é de um tipo permitido para este documento." };
  }
  return { ok: true };
}

/** Rótulos dos tipos aceitos como superior, para orientar o usuário na tela. */
export function tiposSuperioresPermitidos(tipo: TipoDocumentoValor): TipoDocumentoValor[] {
  return SUPERIORES_PERMITIDOS[tipo];
}
