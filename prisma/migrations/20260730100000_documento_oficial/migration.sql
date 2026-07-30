-- Distingue documento oficial (gerado na publicação) de anexo manual.
-- Expand puro: default false faz todo Documento já existente (uploads
-- manuais de hoje) virar "anexo" - semanticamente correto, sem quebrar dado.
ALTER TABLE "Documento" ADD COLUMN "oficial" BOOLEAN NOT NULL DEFAULT false;
