-- CreateEnum
CREATE TYPE "EstadoPendencia" AS ENUM ('pendente', 'resolvida', 'cancelada');

-- CreateTable
CREATE TABLE "Pendencia" (
    "id" TEXT NOT NULL,
    "politicaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "politicaPublicadaEm" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "estado" "EstadoPendencia" NOT NULL DEFAULT 'pendente',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidaEm" TIMESTAMP(3),

    CONSTRAINT "Pendencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pendencia_politicaId_usuarioId_politicaPublicadaEm_key" ON "Pendencia"("politicaId", "usuarioId", "politicaPublicadaEm");

-- CreateIndex
CREATE INDEX "Pendencia_usuarioId_estado_idx" ON "Pendencia"("usuarioId", "estado");

-- AddForeignKey
ALTER TABLE "Pendencia" ADD CONSTRAINT "Pendencia_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "Politica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pendencia" ADD CONSTRAINT "Pendencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
