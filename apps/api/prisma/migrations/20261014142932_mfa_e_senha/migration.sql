-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoAuditoria" ADD VALUE 'ALTERACAO_SENHA';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'MFA_ATIVACAO';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'MFA_DESATIVACAO';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'MFA_FALHA';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'MFA_USO_RECUPERACAO';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'REDEFINICAO_ACESSO';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfaAtivadoEm" TIMESTAMP(3),
ADD COLUMN     "mfaUltimoPasso" INTEGER;

-- CreateTable
CREATE TABLE "mfa_codigos_recuperacao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_codigos_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_codigos_recuperacao_hash_key" ON "mfa_codigos_recuperacao"("hash");

-- CreateIndex
CREATE INDEX "mfa_codigos_recuperacao_userId_idx" ON "mfa_codigos_recuperacao"("userId");

-- AddForeignKey
ALTER TABLE "mfa_codigos_recuperacao" ADD CONSTRAINT "mfa_codigos_recuperacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
