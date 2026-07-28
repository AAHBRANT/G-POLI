-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "usuarioNome" TEXT NOT NULL DEFAULT '',
    "enviada" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PoliticaAudienciaSetores" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PoliticaAudienciaUsuarios" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Notificacao_politicaId_idx" ON "Notificacao"("politicaId");

-- CreateIndex
CREATE UNIQUE INDEX "_PoliticaAudienciaSetores_AB_unique" ON "_PoliticaAudienciaSetores"("A", "B");

-- CreateIndex
CREATE INDEX "_PoliticaAudienciaSetores_B_index" ON "_PoliticaAudienciaSetores"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PoliticaAudienciaUsuarios_AB_unique" ON "_PoliticaAudienciaUsuarios"("A", "B");

-- CreateIndex
CREATE INDEX "_PoliticaAudienciaUsuarios_B_index" ON "_PoliticaAudienciaUsuarios"("B");

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PoliticaAudienciaSetores" ADD CONSTRAINT "_PoliticaAudienciaSetores_A_fkey" FOREIGN KEY ("A") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PoliticaAudienciaSetores" ADD CONSTRAINT "_PoliticaAudienciaSetores_B_fkey" FOREIGN KEY ("B") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PoliticaAudienciaUsuarios" ADD CONSTRAINT "_PoliticaAudienciaUsuarios_A_fkey" FOREIGN KEY ("A") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PoliticaAudienciaUsuarios" ADD CONSTRAINT "_PoliticaAudienciaUsuarios_B_fkey" FOREIGN KEY ("B") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
