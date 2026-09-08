-- Phase 14: bounded usage metadata for service-account credentials.
ALTER TABLE "S3AccessCredential"
ADD COLUMN "requestCount" INTEGER NOT NULL DEFAULT 0;
