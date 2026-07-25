-- AlterTable
ALTER TABLE "Politica" ADD COLUMN     "conteudoPublicado" JSONB;

-- CreateTable
CREATE TABLE "Ciencia" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "usuarioOid" TEXT NOT NULL,
    "usuarioNome" TEXT NOT NULL DEFAULT '',
    "usuarioEmail" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ciencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ciencia_politicaId_idx" ON "Ciencia"("politicaId");

-- CreateIndex
CREATE UNIQUE INDEX "Ciencia_politicaId_usuarioOid_key" ON "Ciencia"("politicaId", "usuarioOid");

-- AddForeignKey
ALTER TABLE "Ciencia" ADD CONSTRAINT "Ciencia_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;
