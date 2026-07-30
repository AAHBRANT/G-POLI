-- Remove os tipos de documento "norma" e "codigo": nao existe TD (Tipo de
-- Documento) oficial correspondente na tabela do SGI (planilha Codificacao
-- de Documentos - Tabelas de Apoio, conferida em 2026-07-30). Mante-los
-- geraria codigo normativo fora do padrao oficial (ORG-TD-AR-SEQ).
--
-- Fase de testes, sem migracao de dados para outro tipo (decisao do
-- usuario, 2026-07-30): registros existentes com esses tipos sao apagados
-- antes da troca do enum - senao o cast abaixo falharia com dados orfaos.
-- Ordem de delecao respeita FKs sem onDelete: Cascade (Versao, Documento):
-- filhos antes do pai. Ciencia/Notificacao/Secao ja cascade automaticamente.
DELETE FROM "Documento" WHERE "versaoId" IN (
  SELECT v.id FROM "Versao" v
  JOIN "Politica" p ON p.id = v."politicaId"
  WHERE p."tipo" IN ('norma', 'codigo')
);
DELETE FROM "Versao" WHERE "politicaId" IN (
  SELECT id FROM "Politica" WHERE "tipo" IN ('norma', 'codigo')
);
DELETE FROM "Politica" WHERE "tipo" IN ('norma', 'codigo');

-- AlterEnum
BEGIN;
CREATE TYPE "TipoDocumento_new" AS ENUM ('politica', 'procedimento', 'instrucao_trabalho', 'manual', 'formulario', 'comunicado_normativo');
ALTER TABLE "Politica" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "Politica" ALTER COLUMN "tipo" TYPE "TipoDocumento_new" USING ("tipo"::text::"TipoDocumento_new");
ALTER TYPE "TipoDocumento" RENAME TO "TipoDocumento_old";
ALTER TYPE "TipoDocumento_new" RENAME TO "TipoDocumento";
DROP TYPE "TipoDocumento_old";
ALTER TABLE "Politica" ALTER COLUMN "tipo" SET DEFAULT 'politica';
COMMIT;
