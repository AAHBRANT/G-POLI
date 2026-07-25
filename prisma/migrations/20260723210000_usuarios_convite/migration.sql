-- oid passa a ser opcional (usuário convidado ainda não logou)
ALTER TABLE "Usuario" ALTER COLUMN "oid" DROP NOT NULL;

-- e-mail vira base da allowlist
ALTER TABLE "Usuario" ADD COLUMN "convidadoPor" TEXT;
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
