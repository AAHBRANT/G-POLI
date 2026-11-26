-- AlterTable
ALTER TABLE "Politica" ADD COLUMN     "paiId" TEXT,
ADD COLUMN     "periodicidadeRevisaoMeses" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "proximaRevisaoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Politica_paiId_idx" ON "Politica"("paiId");

-- CreateIndex
CREATE INDEX "Politica_proximaRevisaoEm_idx" ON "Politica"("proximaRevisaoEm");

-- AddForeignKey
ALTER TABLE "Politica" ADD CONSTRAINT "Politica_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "Politica"("id") ON DELETE SET NULL ON UPDATE CASCADE;
