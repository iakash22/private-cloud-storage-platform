-- Phase 5: S3 gateway service accounts and signing credentials

CREATE TABLE "ServiceAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "S3AccessCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceAccountId" TEXT NOT NULL,
    "accessKeyId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "secretNonce" TEXT NOT NULL,
    "permissions" TEXT[],
    "allowedBucketNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "rotatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "S3AccessCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceAccount_organizationId_name_key" ON "ServiceAccount"("organizationId", "name");
CREATE INDEX "ServiceAccount_organizationId_idx" ON "ServiceAccount"("organizationId");

CREATE UNIQUE INDEX "S3AccessCredential_accessKeyId_key" ON "S3AccessCredential"("accessKeyId");
CREATE INDEX "S3AccessCredential_organizationId_idx" ON "S3AccessCredential"("organizationId");
CREATE INDEX "S3AccessCredential_serviceAccountId_idx" ON "S3AccessCredential"("serviceAccountId");

ALTER TABLE "ServiceAccount" ADD CONSTRAINT "ServiceAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "S3AccessCredential" ADD CONSTRAINT "S3AccessCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "S3AccessCredential" ADD CONSTRAINT "S3AccessCredential_serviceAccountId_fkey" FOREIGN KEY ("serviceAccountId") REFERENCES "ServiceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
