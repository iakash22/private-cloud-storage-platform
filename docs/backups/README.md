# Backup engine

VaultStack backups are asynchronous jobs. Archive **bytes** are stored through `StorageService` in the organization bucket `vs-backups`. PostgreSQL holds job, snapshot, schedule, and restore-plan metadata only.

```text
Dashboard  →  Express API  →  BullMQ (backup-jobs)
                                 ↓
                           Backup Worker
                                 ↓
                           Backup Engine
                                 ↓
                           StorageService
                                 ↓
                           StorageProvider
```

The API worker (`pnpm --filter @vaultstack/api worker:cleanup`) consumes `backup-jobs`. Set `BACKUP_PROCESS_INLINE=true` to run jobs in-process after enqueue (Playwright and local smoke tests).

## Targets

| Target                       | Scope        | Notes                                                                                                 |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `VAULTSTACK_METADATA`        | Organization | Prisma export of org, memberships (no password hashes), roles, buckets, redacted providers, artifacts |
| `VAULTSTACK_OBJECT_METADATA` | Organization | JSONL of `StorageObject` rows                                                                         |
| `APP_CONFIG`                 | Platform     | Redacted env snapshot. Requires `SUPER_ADMIN`                                                         |
| `POSTGRESQL`                 | Platform     | `pg_dump` via `DATABASE_URL`. Requires `SUPER_ADMIN`                                                  |
| `MONGODB`                    | Platform     | `mongodump` when `MONGODB_URI` is set; otherwise skipped                                              |
| `DOCKER_VOLUMES`             | Platform     | Files listed in `BACKUP_DOCKER_VOLUME_PATHS`                                                          |

Platform targets are blocked unless the caller has the organization `SUPER_ADMIN` role.

## Job states

`QUEUED` → `RUNNING` → `VERIFYING` → `COMPLETED`

Failures become `FAILED`. Cancel before start or between steps becomes `CANCELLED`. Failed jobs can be retried (new job, `retryOfJobId` set).

## Bundle format

Each completed job uploads `jobs/{jobId}/backup.tar.gz`:

- `manifest.json` — version, org, job, targets, per-file SHA-256
- `components/` — target payloads
- `checksum.sha256` — member digests

Credentials are never written into manifests, logs, or API responses.

## Retention

Schedules may set `retentionDays` and/or `retentionCount`. Snapshots may also have `expiresAt`. The worker applies retention hourly and deletes storage objects through `ObjectService.remove`.

## Restore foundation

`POST /api/v1/backups/restore` (permission `backup.restore`) verifies the snapshot and stores a **restore plan**. It does not run `pg_restore`, `mongorestore`, or overwrite live data. Live restore is Phase 22.

## Permissions

- `backup.read` — list jobs, snapshots, schedules, logs
- `backup.create` — create/cancel/retry jobs, schedules, verify
- `backup.delete` — delete schedules and snapshots
- `backup.restore` — restore-plan jobs
