-- DropForeignKey
ALTER TABLE "Politica" DROP CONSTRAINT "Politica_consorcioId_fkey";

-- AddForeignKey
ALTER TABLE "Politica" ADD CONSTRAINT "Politica_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
