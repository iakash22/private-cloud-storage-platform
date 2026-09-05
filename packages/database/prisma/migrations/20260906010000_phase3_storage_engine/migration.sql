-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('LOCAL_FILESYSTEM', 'S3_COMPATIBLE');

-- CreateEnum
CREATE TYPE "StorageProviderStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'DISABLED');

-- CreateEnum
CREATE TYPE "BucketVersioningStatus" AS ENUM ('UNVERSIONED', 'ENABLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ChecksumAlgorithm" AS ENUM ('NONE', 'MD5', 'SHA256', 'CRC32');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETING', 'COMPLETED', 'FAILED', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MultipartUploadStatus" AS ENUM ('INITIATED', 'UPLOADING', 'COMPLETING', 'COMPLETED', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoragePolicyEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "StorageProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StorageProviderType" NOT NULL,
    "status" "StorageProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentialRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bucket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storageProviderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "versioning" "BucketVersioningStatus" NOT NULL DEFAULT 'UNVERSIONED',
    "physicalPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageObject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "storageProviderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "etag" TEXT NOT NULL,
    "checksumAlgorithm" "ChecksumAlgorithm" NOT NULL DEFAULT 'SHA256',
    "checksum" TEXT,
    "currentVersionId" TEXT,
    "physicalKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "storageProviderId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "etag" TEXT NOT NULL,
    "checksumAlgorithm" "ChecksumAlgorithm" NOT NULL DEFAULT 'SHA256',
    "checksum" TEXT,
    "physicalKey" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "contentType" TEXT,
    "declaredSize" BIGINT,
    "tokenHash" TEXT NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "providerUploadId" TEXT,
    "receivedSize" BIGINT,
    "checksum" TEXT,
    "objectId" TEXT,
    "failureCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultipartUpload" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "storageProviderId" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "status" "MultipartUploadStatus" NOT NULL DEFAULT 'INITIATED',
    "contentType" TEXT,
    "metadata" JSONB,
    "providerUploadId" TEXT NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultipartUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultipartPart" (
    "id" TEXT NOT NULL,
    "multipartUploadId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "size" BIGINT NOT NULL,
    "etag" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultipartPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoragePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bucketId" TEXT,
    "name" TEXT NOT NULL,
    "effect" "StoragePolicyEffect" NOT NULL DEFAULT 'ALLOW',
    "actions" TEXT[],
    "keyPrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoragePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageProvider_organizationId_idx" ON "StorageProvider"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageProvider_organizationId_name_key" ON "StorageProvider"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Bucket_organizationId_idx" ON "Bucket"("organizationId");

-- CreateIndex
CREATE INDEX "Bucket_storageProviderId_idx" ON "Bucket"("storageProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Bucket_organizationId_name_key" ON "Bucket"("organizationId", "name");

-- CreateIndex
CREATE INDEX "StorageObject_organizationId_idx" ON "StorageObject"("organizationId");

-- CreateIndex
CREATE INDEX "StorageObject_bucketId_key_idx" ON "StorageObject"("bucketId", "key");

-- CreateIndex
CREATE INDEX "StorageObject_organizationId_createdAt_idx" ON "StorageObject"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageObject_bucketId_key_key" ON "StorageObject"("bucketId", "key");

-- CreateIndex
CREATE INDEX "ObjectVersion_organizationId_idx" ON "ObjectVersion"("organizationId");

-- CreateIndex
CREATE INDEX "ObjectVersion_objectId_isCurrent_idx" ON "ObjectVersion"("objectId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectVersion_objectId_versionId_key" ON "ObjectVersion"("objectId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_tokenHash_key" ON "Upload"("tokenHash");

-- CreateIndex
CREATE INDEX "Upload_organizationId_idx" ON "Upload"("organizationId");

-- CreateIndex
CREATE INDEX "Upload_bucketId_idx" ON "Upload"("bucketId");

-- CreateIndex
CREATE INDEX "Upload_status_expiresAt_idx" ON "Upload"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MultipartUpload_organizationId_idx" ON "MultipartUpload"("organizationId");

-- CreateIndex
CREATE INDEX "MultipartUpload_status_expiresAt_idx" ON "MultipartUpload"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartUpload_bucketId_providerUploadId_key" ON "MultipartUpload"("bucketId", "providerUploadId");

-- CreateIndex
CREATE INDEX "MultipartPart_multipartUploadId_idx" ON "MultipartPart"("multipartUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartPart_multipartUploadId_partNumber_key" ON "MultipartPart"("multipartUploadId", "partNumber");

-- CreateIndex
CREATE INDEX "StoragePolicy_organizationId_idx" ON "StoragePolicy"("organizationId");

-- CreateIndex
CREATE INDEX "StoragePolicy_bucketId_idx" ON "StoragePolicy"("bucketId");

-- CreateIndex
CREATE UNIQUE INDEX "StoragePolicy_organizationId_name_key" ON "StoragePolicy"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_organizationId_idx" ON "ShareLink"("organizationId");

-- CreateIndex
CREATE INDEX "ShareLink_objectId_idx" ON "ShareLink"("objectId");

-- AddForeignKey
ALTER TABLE "StorageProvider" ADD CONSTRAINT "StorageProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bucket" ADD CONSTRAINT "Bucket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bucket" ADD CONSTRAINT "Bucket_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "StorageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "StorageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "StorageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartUpload" ADD CONSTRAINT "MultipartUpload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartUpload" ADD CONSTRAINT "MultipartUpload_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartUpload" ADD CONSTRAINT "MultipartUpload_storageProviderId_fkey" FOREIGN KEY ("storageProviderId") REFERENCES "StorageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartPart" ADD CONSTRAINT "MultipartPart_multipartUploadId_fkey" FOREIGN KEY ("multipartUploadId") REFERENCES "MultipartUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoragePolicy" ADD CONSTRAINT "StoragePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoragePolicy" ADD CONSTRAINT "StoragePolicy_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
