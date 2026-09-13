CREATE TABLE "FolderAccessRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "userId" TEXT,
    "teamId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FolderAccessRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FolderAccessRule_organizationId_bucketId_prefix_idx"
  ON "FolderAccessRule"("organizationId", "bucketId", "prefix");
CREATE INDEX "FolderAccessRule_organizationId_userId_idx"
  ON "FolderAccessRule"("organizationId", "userId");
CREATE INDEX "FolderAccessRule_organizationId_teamId_idx"
  ON "FolderAccessRule"("organizationId", "teamId");
CREATE UNIQUE INDEX "FolderAccessRule_bucketId_prefix_userId_teamId_key"
  ON "FolderAccessRule"("bucketId", "prefix", "userId", "teamId");

ALTER TABLE "FolderAccessRule"
  ADD CONSTRAINT "FolderAccessRule_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderAccessRule"
  ADD CONSTRAINT "FolderAccessRule_bucketId_fkey"
  FOREIGN KEY ("bucketId") REFERENCES "Bucket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderAccessRule"
  ADD CONSTRAINT "FolderAccessRule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderAccessRule"
  ADD CONSTRAINT "FolderAccessRule_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
