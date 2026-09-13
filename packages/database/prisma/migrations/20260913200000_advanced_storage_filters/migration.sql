-- Structured object filters use ordinary B-tree indexes. Prefix and
-- case-insensitive key search remain bounded by the existing key index and
-- can be upgraded to pg_trgm after production query volume justifies it.
CREATE INDEX "StorageObject_organizationId_bucketId_contentType_idx"
ON "StorageObject" ("organizationId", "bucketId", "contentType");

CREATE INDEX "StorageObject_organizationId_bucketId_size_idx"
ON "StorageObject" ("organizationId", "bucketId", "size");

CREATE INDEX "StorageObject_organizationId_bucketId_updatedAt_idx"
ON "StorageObject" ("organizationId", "bucketId", "updatedAt");
