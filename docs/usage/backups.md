# Backups

Backup metadata and jobs under `/api/v1/backups`. Archive bytes are stored as normal objects in the org bucket **`vs-backups`**.

See also [../backups/README.md](../backups/README.md).

## Connectivity

```text
Schedule / Job → Snapshot → StorageObject (vs-backups)
                     │
                     ├─ verify
                     └─ restore plan (Phase 22: live restore not fully automated)
```

Permissions: `backup.read`, `backup.create`, `backup.delete`, `backup.restore`.

## Routes

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/backups/summary` | `backup.read` |
| `GET/POST` | `/api/v1/backups/schedules` | read / `backup.create` |
| `GET/PATCH/DELETE` | `/api/v1/backups/schedules/:scheduleId` | read / create / delete |
| `GET/POST` | `/api/v1/backups/jobs` | read / `backup.create` |
| `GET` | `/api/v1/backups/jobs/:jobId` | `backup.read` |
| `GET` | `/api/v1/backups/jobs/:jobId/logs` | `backup.read` |
| `POST` | `/api/v1/backups/jobs/:jobId/cancel` | `backup.create` |
| `POST` | `/api/v1/backups/jobs/:jobId/retry` | `backup.create` |
| `GET` | `/api/v1/backups/snapshots` | `backup.read` |
| `GET/DELETE` | `/api/v1/backups/snapshots/:snapshotId` | read / `backup.delete` |
| `POST` | `/api/v1/backups/snapshots/:snapshotId/verify` | `backup.create` |
| `POST` | `/api/v1/backups/snapshots/:snapshotId/restore` | `backup.restore` |
| `GET/POST` | `/api/v1/backups/restore` | `backup.restore` |
| `GET` | `/api/v1/backups/restore/:restoreId` | `backup.restore` |

## How to use

1. Authenticate with session or API key that has backup permissions.
2. Create a **schedule** or one-off **job** from the dashboard (**Backups**) or REST.
3. Inspect **snapshots**, run **verify**, request a **restore plan**.

Workers process long-running backup jobs (BullMQ); do not expect the HTTP request itself to hold the full archive stream.

## Error codes

`BACKUP_JOB_NOT_FOUND`, `BACKUP_SNAPSHOT_NOT_FOUND`, `BACKUP_SCHEDULE_NOT_FOUND`, `BACKUP_RESTORE_NOT_FOUND`, `BACKUP_INVALID_STATE`, `BACKUP_TARGET_FORBIDDEN`, `BACKUP_VERIFICATION_FAILED`.

## Test

- Dashboard Backups UI smoke check against a running stack  
- API coverage under `apps/api` backup integration tests (see [../development/testing.md](../development/testing.md))
