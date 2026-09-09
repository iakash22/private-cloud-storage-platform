-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "totpSecretCiphertext" TEXT;
ALTER TABLE "User" ADD COLUMN "totpSecretNonce" TEXT;
ALTER TABLE "User" ADD COLUMN "totpBackupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];
