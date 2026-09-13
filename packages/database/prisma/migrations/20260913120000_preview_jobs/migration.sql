CREATE TABLE "PreviewJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "outputObjectId" TEXT,
    "error" TEXT,
    "converter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviewJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PreviewJob_organizationId_createdAt_idx"
  ON "PreviewJob"("organizationId", "createdAt");
CREATE INDEX "PreviewJob_objectId_kind_status_idx"
  ON "PreviewJob"("objectId", "kind", "status");

ALTER TABLE "PreviewJob"
  ADD CONSTRAINT "PreviewJob_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreviewJob"
  ADD CONSTRAINT "PreviewJob_objectId_fkey"
  FOREIGN KEY ("objectId") REFERENCES "StorageObject"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
