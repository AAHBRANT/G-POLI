-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('admin', 'sgi', 'diretoria', 'area', 'colaborador');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "oid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "perfil" "Perfil" NOT NULL DEFAULT 'colaborador',
    "areaId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_oid_key" ON "Usuario"("oid");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
