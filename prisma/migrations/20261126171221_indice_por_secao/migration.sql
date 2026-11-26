-- CreateTable
CREATE TABLE "TrechoPolitica" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "revisao" INTEGER NOT NULL,
    "secaoCodigo" TEXT NOT NULL,
    "secaoTitulo" TEXT NOT NULL,
    "parte" INTEGER NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "textoBusca" TEXT NOT NULL,
    -- Coluna GERADA pelo banco: tsvector em português sobre o texto já sem acento/minúsculo.
    "busca" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', "textoBusca")) STORED,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrechoPolitica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrechoPolitica_busca_idx" ON "TrechoPolitica" USING GIN ("busca");

-- CreateIndex
CREATE INDEX "TrechoPolitica_politicaId_idx" ON "TrechoPolitica"("politicaId");

-- AddForeignKey
ALTER TABLE "TrechoPolitica" ADD CONSTRAINT "TrechoPolitica_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;
