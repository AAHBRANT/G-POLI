import { tipoDocumentoValido, type TipoDocumentoValor } from "@/lib/constants";

// Importação em lote do acervo: regras PURAS para sugerir tipo, área e título a
// partir do NOME do arquivo. É só uma sugestão — a pessoa confere e edita na
// tela antes de importar, e o código normativo é sempre gerado pelo sistema
// (nunca copiado do arquivo), como na importação de um documento só.

const TD_PARA_TIPO: Record<string, TipoDocumentoValor> = {
  POL: "politica",
  NOR: "norma",
  PRO: "procedimento",
  IT: "instrucao_trabalho",
  MAN: "manual",
  FOR: "formulario",
  COD: "codigo",
  CN: "comunicado_normativo",
};

/** Nome da área por sigla oficial (mesma tabela de siglaArea em dominio.ts). */
export const NOME_AREA_POR_SIGLA: Record<string, string> = {
  DIR: "Diretoria",
  SGI: "Sistema de Gestão Integrado",
  QUA: "Qualidade",
  ENG: "Engenharia e Projetos",
  OBR: "Obras e Produção",
  SUP: "Suprimentos e Compras",
  COM: "Comercial e Orçamentos",
  ADM: "Administrativo e Financeiro",
  RH: "Recursos Humanos",
  SSO: "Segurança do Trabalho e Saúde Ocupacional",
  MA: "Meio Ambiente",
  PLJ: "Planejamento",
  PRP: "Proposta",
  SOC: "Social",
  TI: "Tecnologia da Informação",
};

const PALAVRA_PARA_TIPO: [RegExp, TipoDocumentoValor][] = [
  [/^politica\b/, "politica"],
  [/^norma\b/, "norma"],
  [/^procedimento\b/, "procedimento"],
  [/^instrucao\b/, "instrucao_trabalho"],
  [/^manual\b/, "manual"],
  [/^formulario\b/, "formulario"],
  [/^codigo\b/, "codigo"],
  [/^comunicado\b/, "comunicado_normativo"],
];

// ORG-TD-AR-SEQ[-REV], ex.: AHBT-PRO-QUA-001-02
const CODIGO_NO_NOME = /(?:^|[^A-Za-z0-9])([A-Za-z]{2,5})-(POL|NOR|PRO|IT|MAN|FOR|COD|CN)-([A-Za-z]{1,4})-(\d{1,4})(?:-\d{1,3})?(?![A-Za-z0-9])/i;

export type SugestaoArquivo = {
  tipo: TipoDocumentoValor | null;
  /** Nome completo da área, quando a sigla do nome do arquivo é conhecida. */
  area: string | null;
  titulo: string;
};

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function limparTitulo(bruto: string): string {
  let t = bruto;
  // Sem espaços no nome? Hífen e sublinhado separam palavras. Com espaços: só sublinhado.
  t = /\s/.test(t.trim()) ? t.replace(/_+/g, " ") : t.replace(/[-_]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  // marcadores de versão/data no fim: "v2", "rev 3", "2026-07", "(1)"
  let anterior = "";
  while (anterior !== t) {
    anterior = t;
    t = t
      .replace(/[\s_-]*\(\d+\)$/i, "")
      .replace(/[\s_-]+(?:v|rev\.?|revisao|revisão|r)\s?\d+$/i, "")
      .replace(/[\s_-]+\d{4}[-_ ]\d{2}(?:[-_ ]\d{2})?$/, "")
      .replace(/^[\s_-]+|[\s_-]+$/g, "");
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function analisarNomeArquivo(nomeArquivo: string): SugestaoArquivo {
  const base = nomeArquivo.replace(/\.[A-Za-z0-9]{1,5}$/, "");

  let tipo: TipoDocumentoValor | null = null;
  let area: string | null = null;
  let restante = base;

  const m = CODIGO_NO_NOME.exec(base);
  if (m) {
    tipo = TD_PARA_TIPO[m[2].toUpperCase()] ?? null;
    area = NOME_AREA_POR_SIGLA[m[3].toUpperCase()] ?? null;
    restante = (base.slice(0, m.index) + " " + base.slice(m.index + m[0].length)).trim();
  }

  const titulo = limparTitulo(restante) || limparTitulo(base) || nomeArquivo;

  if (!tipo) {
    const t = semAcento(titulo).toLowerCase();
    tipo = PALAVRA_PARA_TIPO.find(([re]) => re.test(t))?.[1] ?? null;
  }
  return { tipo: tipo && tipoDocumentoValido(tipo) ? tipo : null, area, titulo };
}

export const LIMITE_ARQUIVOS_LOTE = 50;
