-- AlterTable
ALTER TABLE "MultipartUpload"
ADD COLUMN "declaredSize" BIGINT,
ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "failureCode" TEXT;

-- CreateIndex
CREATE INDEX "MultipartUpload_organizationId_status_lastActivityAt_idx"
ON "MultipartUpload"("organizationId", "status", "lastActivityAt");
