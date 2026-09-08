-- Phase 9: encrypted organization-stored S3-compatible provider credentials.
-- Secret keys are AES-256-GCM ciphertext; they are never stored in `config`.

ALTER TABLE "StorageProvider" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "StorageProvider" ADD COLUMN "secretCiphertext" TEXT;
ALTER TABLE "StorageProvider" ADD COLUMN "secretNonce" TEXT;
