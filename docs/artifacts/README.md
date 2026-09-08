# CI/CD artifact storage

Phase 10 stores build artifacts, packages, logs, archives, and release bundles **on top of VaultStack object storage**. There is no second byte engine.

```text
Project → Build → Artifact → ArtifactVersion → StorageObject → StorageProvider
```

## Rules

- Every row is organization-scoped. Nested lookups start from `(organizationId, projectId)`.
- `ArtifactVersion.storageObjectId` is the only pointer to bytes. Completing an upload calls `UploadService.complete`; downloads mint the existing storage download URL; deletes call `ObjectService.remove` before dropping the version row (`onDelete: Restrict` prevents orphaning a live object pointer).
- The first upload lazily creates the org bucket `vs-artifacts`. Object keys are server-generated: `ci/{projectId}/{buildId}/{artifactId}/{versionId}/{fileName}`.
- Permissions: `artifact.read`, `artifact.upload`, `artifact.delete`.
- Retention expires non-release `AVAILABLE` versions older than `Project.retentionDays` and stale `PENDING`/`FAILED` versions after 24 hours. Release versions are kept until deleted.

## HTTP

Mounted at `/api/v1/artifacts` with organization from auth context (same as storage). See [../api/README.md](../api/README.md).
