// Esqueleto normativo de POLÍTICA, conforme o Manual de Padronização Documental
// do SGI da AAHBRANT, capítulo 16.1.
//
// O Manual define estrutura DIFERENTE por tipo de documento. Esta é a de Política:
// Objetivo · Abrangência · Princípios · Diretrizes · Responsabilidades ·
// Compromissos · Disposições Gerais.
//
// Duas seções foram retiradas por não pertencerem à Política:
// - "Definições" pertence ao Procedimento Operacional (16.2). Termo que precise de
//   definição numa Política entra no próprio texto.
// - "Anexos" também é elemento de Procedimento (16.2); 16.1 encerra em Disposições
//   Gerais.
//
// A tabela de Controle de Revisões, que o Manual exige como primeiro elemento do
// documento (cap. 19), NÃO é seção de conteúdo: ela é derivada do histórico de
// versões da política e deve ser montada na exportação, não digitada pelo usuário.

export type ModeloSecao = {
  ordem: number;
  codigo: string;
  titulo: string;
  tipo: "texto" | "tabela";
  colunas?: string[];
  dica?: string;
};

export const ESQUELETO_PADRAO: ModeloSecao[] = [
  {
    ordem: 1,
    codigo: "1",
    titulo: "Objetivo",
    tipo: "texto",
    dica: "O que a política se propõe a estabelecer e por quê.",
  },
  {
    ordem: 2,
    codigo: "2",
    titulo: "Abrangência",
    tipo: "texto",
    dica: "A quem, onde e em que situações se aplica; exceções.",
  },
  {
    ordem: 3,
    codigo: "3",
    titulo: "Princípios",
    tipo: "texto",
    dica: "Princípios e valores que fundamentam a política.",
  },
  {
    ordem: 4,
    codigo: "4",
    titulo: "Diretrizes",
    tipo: "texto",
    dica: "Diretrizes gerais do tema; use subtítulos (4.1, 4.2…). Não descrever execução operacional — isso é do Procedimento.",
  },
  {
    ordem: 5,
    codigo: "5",
    titulo: "Responsabilidades",
    tipo: "tabela",
    colunas: ["Setor", "Responsabilidades"],
    dica: "Quem responde por quê (Diretoria, SGI, Gestor, Colaborador…). Usar verbos diretivos: Compete, Cabe ao, É responsabilidade.",
  },
  {
    ordem: 6,
    codigo: "6",
    titulo: "Compromissos",
    tipo: "texto",
    dica: "Compromissos que a empresa assume em relação ao tema.",
  },
  {
    ordem: 7,
    codigo: "7",
    titulo: "Disposições Gerais",
    tipo: "texto",
    dica: "Vigência, revisão, casos omissos e aprovação.",
  },
];
