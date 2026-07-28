-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('politica', 'norma', 'procedimento', 'instrucao_trabalho', 'manual', 'codigo', 'formulario', 'comunicado_normativo');

-- AlterTable
ALTER TABLE "Politica" ADD COLUMN     "tipo" "TipoDocumento" NOT NULL DEFAULT 'politica';
