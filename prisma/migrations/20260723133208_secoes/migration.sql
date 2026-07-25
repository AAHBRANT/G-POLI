-- CreateEnum
CREATE TYPE "TipoSecao" AS ENUM ('texto', 'tabela');

-- CreateTable
CREATE TABLE "Secao" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoSecao" NOT NULL DEFAULT 'texto',
    "corpo" TEXT NOT NULL DEFAULT '',
    "colunas" JSONB,
    "linhas" JSONB,
    "atualizadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Secao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Secao_politicaId_codigo_key" ON "Secao"("politicaId", "codigo");

-- AddForeignKey
ALTER TABLE "Secao" ADD CONSTRAINT "Secao_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;
