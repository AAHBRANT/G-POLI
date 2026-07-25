-- CreateEnum
CREATE TYPE "Classificacao" AS ENUM ('publico_interno', 'restrito', 'confidencial');

-- CreateEnum
CREATE TYPE "EstadoPolitica" AS ENUM ('rascunho', 'publicada', 'revogada');

-- CreateEnum
CREATE TYPE "EstadoVersao" AS ENUM ('ativa', 'substituida');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('importado', 'processando', 'reconhecido', 'falhou', 'aguardando_acao');

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Politica" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "classificacao" "Classificacao" NOT NULL,
    "estado" "EstadoPolitica" NOT NULL DEFAULT 'rascunho',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadaEm" TIMESTAMP(3),
    "revogadaEm" TIMESTAMP(3),

    CONSTRAINT "Politica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Versao" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoVersao" NOT NULL DEFAULT 'ativa',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'importado',
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Area_nome_key" ON "Area"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Politica_titulo_areaId_key" ON "Politica"("titulo", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Versao_politicaId_numero_key" ON "Versao"("politicaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Documento_versaoId_key" ON "Documento"("versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Documento_hash_key" ON "Documento"("hash");

-- AddForeignKey
ALTER TABLE "Politica" ADD CONSTRAINT "Politica_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Versao" ADD CONSTRAINT "Versao_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "Politica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "Versao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
