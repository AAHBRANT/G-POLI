import fs from "fs/promises";
import path from "path";
import { createReport } from "docx-templates";

// Modelo Word real (não uma reprodução em HTML) — ver
// docs/superpowers/specs/2026-07-30-geracao-docx-oficial-design.md.
const CAMINHO_MODELO = path.join(process.cwd(), "templates", "politica-modelo.docx");

export type SecaoDocx = {
  codigo: string;
  titulo: string;
  corpo: string; // já achatado por corpoParaTexto (lib/politica/dominio.ts)
};

// Uma linha da tabela "Controle de Revisões" (primeiro elemento do corpo do
// documento oficial — Manual do SGI, cap. 19). Todos os campos já vêm
// formatados como texto (data em pt-BR, revisão com dois dígitos).
export type LinhaControleRevisoes = {
  revisao: string;
  data: string;
  descricao: string;
  responsavel: string;
};

export type DadosDocumentoOficial = {
  titulo: string;
  codigo: string | null;
  publicadaEm: Date;
  areaNome: string;
  revisao: number;
  controleRevisoes: LinhaControleRevisoes[];
  secoes: SecaoDocx[];
};

// Gera o .docx oficial preenchendo o modelo real. Erros de leitura do
// template ou de preenchimento (tag ausente, XML inválido) SOBEM para o
// chamador — nunca engolir aqui (ver docs/learnings.md, regra sobre catch
// silencioso). Quem decide o que fazer com a falha é publicarPolitica
// (fail-closed: bloqueia a publicação).
export async function gerarDocumentoOficial(dados: DadosDocumentoOficial): Promise<Buffer> {
  const template = await fs.readFile(CAMINHO_MODELO);
  const resultado = await createReport({
    template,
    cmdDelimiter: ["{", "}"],
    // OOXML estrito não permite <w:br/> como filho de <w:t> (só texto) — o
    // padrão do docx-templates gera exatamente isso para corpo multilinha.
    // Word tolera na prática, mas isso NÃO é válido pelo schema; esta opção
    // faz o line break virar um <w:br/> irmão, entre <w:t> separados,
    // conforme o schema exige (achado na revisão final da feature —
    // confirmado via inspeção de word/document.xml, ver
    // docs/superpowers/specs/2026-07-30-geracao-docx-oficial-design.md).
    processLineBreaksAsNewText: true,
    data: {
      titulo: dados.titulo,
      codigo: dados.codigo ?? "—",
      data: dados.publicadaEm.toLocaleDateString("pt-BR"),
      unidade: "",
      areaResponsavel: dados.areaNome,
      revisao: String(dados.revisao).padStart(2, "0"),
      controleRevisoes: dados.controleRevisoes,
      secoes: dados.secoes,
    },
  });
  return Buffer.from(resultado);
}
