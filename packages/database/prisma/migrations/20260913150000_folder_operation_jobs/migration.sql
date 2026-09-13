CREATE TABLE "FolderOperationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "sourcePrefix" TEXT NOT NULL,
    "destinationPrefix" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "processedObjects" INTEGER NOT NULL DEFAULT 0,
    "totalObjects" INTEGER,
    "failedObjects" INTEGER NOT NULL DEFAULT 0,
    "nextCursor" TEXT,
    "error" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolderOperationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FolderOperationJob_organizationId_createdAt_idx"
  ON "FolderOperationJob"("organizationId", "createdAt");
CREATE INDEX "FolderOperationJob_organizationId_status_idx"
  ON "FolderOperationJob"("organizationId", "status");
CREATE INDEX "FolderOperationJob_bucketId_sourcePrefix_idx"
  ON "FolderOperationJob"("bucketId", "sourcePrefix");

ALTER TABLE "FolderOperationJob"
  ADD CONSTRAINT "FolderOperationJob_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderOperationJob"
  ADD CONSTRAINT "FolderOperationJob_bucketId_fkey"
  FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
