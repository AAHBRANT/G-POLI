-- AlterEnum
-- Cada valor precisa ser adicionado fora de uma transação explícita (regra do
-- Postgres: não pode ser usado na mesma transação em que foi criado). O
-- cliente psql/prisma roda cada statement autocommitado por padrão, então
-- não precisa de BEGIN/COMMIT manual aqui.
ALTER TYPE "EstadoPolitica" ADD VALUE 'em_aprovacao_gestor';
ALTER TYPE "EstadoPolitica" ADD VALUE 'em_aprovacao_diretoria';

-- AlterTable
ALTER TABLE "Politica" ADD COLUMN     "enviadaAprovacaoEm" TIMESTAMP(3),
ADD COLUMN     "enviadaAprovacaoPorNome" TEXT,
ADD COLUMN     "enviadaAprovacaoPorEmail" TEXT,
ADD COLUMN     "aprovadaGestorEm" TIMESTAMP(3),
ADD COLUMN     "aprovadaGestorPorNome" TEXT,
ADD COLUMN     "aprovadaGestorPorEmail" TEXT,
ADD COLUMN     "rejeitadaEm" TIMESTAMP(3),
ADD COLUMN     "rejeitadaPorNome" TEXT,
ADD COLUMN     "rejeitadaPorEmail" TEXT,
ADD COLUMN     "rejeitadaNaEtapa" TEXT,
ADD COLUMN     "motivoRejeicao" TEXT;
