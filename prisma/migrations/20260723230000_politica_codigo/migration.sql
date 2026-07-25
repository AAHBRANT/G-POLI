ALTER TABLE "Politica" ADD COLUMN "codigo" TEXT;
CREATE UNIQUE INDEX "Politica_codigo_key" ON "Politica"("codigo");
