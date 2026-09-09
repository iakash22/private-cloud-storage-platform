ALTER TABLE "AuditLog"
  ADD COLUMN "serviceAccountId" TEXT,
  ADD COLUMN "result" TEXT NOT NULL DEFAULT 'success',
  ADD COLUMN "requestId" TEXT;

CREATE INDEX "AuditLog_organizationId_action_createdAt_idx"
  ON "AuditLog"("organizationId", "action", "createdAt");
CREATE INDEX "AuditLog_organizationId_result_createdAt_idx"
  ON "AuditLog"("organizationId", "result", "createdAt");
CREATE INDEX "AuditLog_organizationId_resourceType_createdAt_idx"
  ON "AuditLog"("organizationId", "resourceType", "createdAt");
CREATE INDEX "AuditLog_serviceAccountId_idx" ON "AuditLog"("serviceAccountId");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_serviceAccountId_fkey"
  FOREIGN KEY ("serviceAccountId") REFERENCES "ServiceAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
