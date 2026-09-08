-- CreateEnum
CREATE TYPE "StoragePolicyKind" AS ENUM ('ACCESS', 'LIFECYCLE');

-- CreateEnum
CREATE TYPE "StorageLifecycleAction" AS ENUM ('EXPIRE_CURRENT', 'EXPIRE_NONCURRENT', 'ABORT_INCOMPLETE_MULTIPART', 'EXPIRE_TEMPORARY');

-- AlterTable
ALTER TABLE "StorageObject" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ObjectVersion" ADD COLUMN "isDeleteMarker" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StoragePolicy" ADD COLUMN "kind" "StoragePolicyKind" NOT NULL DEFAULT 'ACCESS';
ALTER TABLE "StoragePolicy" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StoragePolicy" ADD COLUMN "days" INTEGER;
ALTER TABLE "StoragePolicy" ADD COLUMN "lifecycleAction" "StorageLifecycleAction";

-- CreateIndex
CREATE INDEX "StorageObject_bucketId_isDeleted_key_idx" ON "StorageObject"("bucketId", "isDeleted", "key");

-- CreateIndex
CREATE INDEX "ObjectVersion_organizationId_objectId_versionId_idx" ON "ObjectVersion"("organizationId", "objectId", "versionId");

-- CreateIndex
CREATE INDEX "ObjectVersion_bucketId_isCurrent_createdAt_idx" ON "ObjectVersion"("bucketId", "isCurrent", "createdAt");

-- CreateIndex
CREATE INDEX "StoragePolicy_organizationId_kind_enabled_idx" ON "StoragePolicy"("organizationId", "kind", "enabled");
