# Route catalog (by feature)

Machine-oriented list of `/api/v1` surfaces. For request/response schemas use OpenAPI (`/api/docs`) and [`../api/README.md`](../api/README.md).

Auth legend: **Pub** public · **Sess** session/API key · **Tok** content token · **SigV4** S3 gateway · **Opt** optional session.

## Health

| Method | Path                              | Auth |
| ------ | --------------------------------- | ---- |
| `GET`  | `/health`, `/ready`               | Pub  |
| `GET`  | `/api/v1/health`, `/api/v1/ready` | Pub  |

## Auth

| Method   | Path                                  | Auth |
| -------- | ------------------------------------- | ---- |
| `POST`   | `/api/v1/auth/register`               | Pub  |
| `POST`   | `/api/v1/auth/login`                  | Pub  |
| `POST`   | `/api/v1/auth/login/totp`             | Pub  |
| `POST`   | `/api/v1/auth/logout`                 | Sess |
| `GET`    | `/api/v1/auth/sessions`               | Sess |
| `DELETE` | `/api/v1/auth/sessions/:sessionId`    | Sess |
| `POST`   | `/api/v1/auth/sessions/revoke-others` | Sess |
| `GET`    | `/api/v1/auth/me`                     | Sess |
| `POST`   | `/api/v1/auth/organization`           | Sess |
| `POST`   | `/api/v1/auth/2fa/setup`              | Sess |
| `POST`   | `/api/v1/auth/2fa/enable`             | Sess |
| `POST`   | `/api/v1/auth/2fa/disable`            | Sess |

## Organizations / IAM

| Method                  | Path                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `GET/POST`              | `/api/v1/organizations`                                               |
| `GET/PATCH`             | `/api/v1/organizations/:organizationId`                               |
| `GET/POST`              | `/api/v1/organizations/:organizationId/users`                         |
| `GET/PATCH`             | `/api/v1/organizations/:organizationId/users/:userId`                 |
| `POST/DELETE`           | `/api/v1/organizations/:organizationId/users/:userId/roles[/:roleId]` |
| `GET/POST`              | `/api/v1/organizations/:organizationId/roles`                         |
| `GET`                   | `/api/v1/organizations/:organizationId/roles/:roleId`                 |
| `GET/POST/PATCH/DELETE` | `/api/v1/organizations/:organizationId/teams…`                        |
| `GET`                   | `/api/v1/permissions`                                                 |
| `GET/POST/DELETE`       | `/api/v1/organizations/:organizationId/api-keys[/:apiKeyId]`          |
| `GET/POST/PATCH`        | `/api/v1/organizations/:organizationId/s3-credentials…`               |
| `GET`                   | `/api/v1/organizations/:organizationId/audit-logs`                    |

## Storage providers / buckets / objects

| Method             | Path                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| `GET/POST`         | `/api/v1/storage/providers`                                                      |
| `GET/PATCH/DELETE` | `/api/v1/storage/providers/:providerId`                                          |
| `POST`             | `/api/v1/storage/providers/:providerId/test`                                     |
| `GET/POST`         | `/api/v1/storage/buckets`                                                        |
| `GET/DELETE`       | `/api/v1/storage/buckets/:bucketId`                                              |
| `PUT`              | `/api/v1/storage/buckets/:bucketId/versioning`                                   |
| `GET`              | `/api/v1/storage/buckets/:bucketId/summary`                                      |
| `GET`              | `/api/v1/storage/buckets/:bucketId/objects`                                      |
| `POST`             | `/api/v1/storage/buckets/:bucketId/folders`                                      |
| `POST`             | `/api/v1/storage/folder-operations`                                              |
| `GET/POST`         | `/api/v1/storage/folder-operations/:jobId` · `/cancel` · `/retry`                |
| `GET/DELETE`       | `/api/v1/storage/objects/:objectId`                                              |
| `PATCH`            | `/api/v1/storage/objects/:objectId/metadata`                                     |
| `GET`              | `/api/v1/storage/buckets/:bucketId/folder-access`                                |
| `POST/DELETE`      | `/api/v1/storage/folder-access` · `/:ruleId`                                     |
| `POST`             | `/api/v1/storage/objects/:objectId/download-url`                                 |
| `POST`             | `/api/v1/storage/objects/:objectId/previews`                                     |
| `GET`              | `/api/v1/storage/previews/:jobId`                                                |
| `GET`              | `/api/v1/storage/objects/:objectId/versions[/:versionId]`                        |
| `POST/DELETE`      | `/api/v1/storage/objects/:objectId/versions/:versionId/restore` · delete version |
| `POST`             | `/api/v1/storage/objects/:objectId/copy` · `/move`                               |

## Uploads / multipart / content tokens

| Method            | Path                                                                    | Auth |
| ----------------- | ----------------------------------------------------------------------- | ---- |
| `POST`            | `/api/v1/storage/uploads/initiate`                                      | Sess |
| `POST/DELETE`     | `/api/v1/storage/uploads/:uploadId[/complete]`                          | Sess |
| `GET/POST/DELETE` | `/api/v1/storage/multipart-uploads…`                                    | Sess |
| `GET`             | `/api/v1/storage/objects/:objectId/content`                             | Tok  |
| `PUT`             | `/api/v1/storage/uploads/:uploadId/content`                             | Tok  |
| `PUT`             | `/api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/content` | Tok  |

## Shares / policies

| Method                  | Path                                       | Auth      |
| ----------------------- | ------------------------------------------ | --------- |
| `POST`                  | `/api/v1/storage/objects/:objectId/shares` | Sess      |
| `GET/PATCH/DELETE`      | `/api/v1/storage/shares[/:shareId]`        | Sess      |
| `GET/POST`              | `/api/v1/public/shares/:token[…]`          | Opt / Pub |
| `POST`                  | `/api/v1/public/shares/:token/preview-url` | Pub       |
| `GET/POST/PATCH/DELETE` | `/api/v1/storage/policies[/:policyId]`     | Sess      |

## Artifacts

| Method             | Path                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| `GET/POST`         | `/api/v1/artifacts/projects`                                                    |
| `GET/PATCH/DELETE` | `/api/v1/artifacts/projects/:projectId`                                         |
| `GET/POST`         | `/api/v1/artifacts/projects/:projectId/builds`                                  |
| `GET/PATCH/DELETE` | `/api/v1/artifacts/projects/:projectId/builds/:buildId`                         |
| `GET/POST`         | `/api/v1/artifacts/projects/:projectId/builds/:buildId/artifacts`               |
| `GET`              | `/api/v1/artifacts/projects/:projectId/artifacts` · `/releases`                 |
| `GET/DELETE`       | `/api/v1/artifacts/:artifactId`                                                 |
| `GET`              | `/api/v1/artifacts/:artifactId/versions`                                        |
| `GET`              | `/api/v1/artifacts/versions/:versionId`                                         |
| `POST`             | `/api/v1/artifacts/versions/:versionId/complete` · `/download-url` · `/release` |
| `DELETE`           | `/api/v1/artifacts/versions/:versionId`                                         |

## Backups

| Method                  | Path                                            |
| ----------------------- | ----------------------------------------------- |
| `GET`                   | `/api/v1/backups/summary`                       |
| `GET/POST/PATCH/DELETE` | `/api/v1/backups/schedules…`                    |
| `GET/POST`              | `/api/v1/backups/jobs…` (+ cancel/retry/logs)   |
| `GET/DELETE`            | `/api/v1/backups/snapshots…` (+ verify/restore) |
| `GET/POST`              | `/api/v1/backups/restore…`                      |

## Infrastructure

| Method | Path                                                                             |
| ------ | -------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/infrastructure/summary` · `/server` · `/disks` · `/storage` · `/docker` |

## S3 gateway (when enabled)

| Surface | Path                  | Auth  |
| ------- | --------------------- | ----- |
| S3 API  | `/api/v1/s3/{proxy+}` | SigV4 |

## Feature → doc map

| Feature                       | Usage doc                                  |
| ----------------------------- | ------------------------------------------ |
| Auth / API keys / S3 creds    | [auth-access.md](./auth-access.md)         |
| Providers / buckets / objects | [storage.md](./storage.md)                 |
| Initiate / PUT / complete     | [uploads.md](./uploads.md)                 |
| Projects / builds             | [artifacts.md](./artifacts.md)             |
| AWS SDK                       | [s3-gateway.md](./s3-gateway.md)           |
| Shares / policies             | [shares-policies.md](./shares-policies.md) |
| Backups                       | [backups.md](./backups.md)                 |
| Monitoring                    | [infrastructure.md](./infrastructure.md)   |
| Connectivity diagram          | [connectivity.md](./connectivity.md)       |
