-- AlterEnum
ALTER TYPE "Perfil" ADD VALUE 'superadmin';

-- CreateTable
CREATE TABLE "_UsuarioSetores" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UsuarioSetores_AB_unique" ON "_UsuarioSetores"("A", "B");

-- CreateIndex
CREATE INDEX "_UsuarioSetores_B_index" ON "_UsuarioSetores"("B");

-- AddForeignKey
ALTER TABLE "_UsuarioSetores" ADD CONSTRAINT "_UsuarioSetores_A_fkey" FOREIGN KEY ("A") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioSetores" ADD CONSTRAINT "_UsuarioSetores_B_fkey" FOREIGN KEY ("B") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
