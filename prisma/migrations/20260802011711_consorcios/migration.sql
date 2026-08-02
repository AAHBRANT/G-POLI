-- AlterTable
ALTER TABLE "Politica" ADD COLUMN     "consorcioId" TEXT;

-- CreateTable
CREATE TABLE "Consorcio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consorcio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UsuarioConsorcios" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Consorcio_nome_key" ON "Consorcio"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "_UsuarioConsorcios_AB_unique" ON "_UsuarioConsorcios"("A", "B");

-- CreateIndex
CREATE INDEX "_UsuarioConsorcios_B_index" ON "_UsuarioConsorcios"("B");

-- AddForeignKey
ALTER TABLE "Politica" ADD CONSTRAINT "Politica_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioConsorcios" ADD CONSTRAINT "_UsuarioConsorcios_A_fkey" FOREIGN KEY ("A") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioConsorcios" ADD CONSTRAINT "_UsuarioConsorcios_B_fkey" FOREIGN KEY ("B") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
