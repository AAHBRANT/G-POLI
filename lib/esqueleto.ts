// Esqueleto normativo padrão AAHBRANT (base: modelos de política do SGI).
// Toda nova política nasce com estas 8 seções.

export type ModeloSecao = {
  ordem: number;
  codigo: string;
  titulo: string;
  tipo: "texto" | "tabela";
  colunas?: string[];
  dica?: string;
};

export const ESQUELETO_PADRAO: ModeloSecao[] = [
  { ordem: 1, codigo: "1", titulo: "Objetivo", tipo: "texto", dica: "Finalidade do regulamento e o que ele estabelece." },
  { ordem: 2, codigo: "2", titulo: "Abrangência", tipo: "texto", dica: "A quem, onde e em que situações se aplica; exceções." },
  { ordem: 3, codigo: "3", titulo: "Princípios", tipo: "texto", dica: "Princípios que fundamentam a política." },
  {
    ordem: 4,
    codigo: "4",
    titulo: "Definições",
    tipo: "tabela",
    colunas: ["Termo", "Definição"],
    dica: "Glossário dos termos usados na política.",
  },
  {
    ordem: 5,
    codigo: "5",
    titulo: "Responsabilidades",
    tipo: "tabela",
    colunas: ["Setor", "Responsabilidades"],
    dica: "Quem responde por quê (Diretoria, RH, SGI, Gestor, Comitê, Colaborador…).",
  },
  { ordem: 6, codigo: "6", titulo: "Diretrizes Gerais", tipo: "texto", dica: "Corpo específico do tema; use subtítulos (6.1, 6.2…)." },
  { ordem: 7, codigo: "7", titulo: "Disposições Finais", tipo: "texto", dica: "Vigência, revisão, casos omissos, aprovação." },
  { ordem: 8, codigo: "8", titulo: "Anexos", tipo: "texto", dica: "Planilhas, tabelas e formulários relacionados." },
];
