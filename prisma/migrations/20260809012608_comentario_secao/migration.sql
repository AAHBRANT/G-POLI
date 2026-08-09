-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "secaoId" TEXT NOT NULL,
    "paragrafoIndex" INTEGER NOT NULL,
    "trechoAncora" TEXT NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "autorEmail" TEXT NOT NULL,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "resolvidoPorNome" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respostaDeId" TEXT,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comentario_secaoId_idx" ON "Comentario"("secaoId");

-- CreateIndex
CREATE INDEX "Comentario_respostaDeId_idx" ON "Comentario"("respostaDeId");

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_secaoId_fkey" FOREIGN KEY ("secaoId") REFERENCES "Secao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_respostaDeId_fkey" FOREIGN KEY ("respostaDeId") REFERENCES "Comentario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
