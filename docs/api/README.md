# API documentation

All business APIs are served under `/api/v1`.

Infrastructure probes remain at `/health` and `/ready` (also mirrored at `/api/v1/health` and `/api/v1/ready`).

## Interactive docs (OpenAPI / Swagger)

When the API is running:

| URL                                                                              | Description                           |
| -------------------------------------------------------------------------------- | ------------------------------------- |
| [http://localhost:3000/api/docs](http://localhost:3000/api/docs)                 | Swagger UI — browse and try endpoints |
| [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json) | OpenAPI 3.0 JSON document             |

The machine-readable spec lives at [`packages/openapi/spec/openapi.yaml`](../../packages/openapi/spec/openapi.yaml). Keep it in sync with routes and Zod schemas (see [`AGENTS.md`](../../AGENTS.md) rules 21–22).

## Error envelope

Every error includes a request id:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email: Invalid email",
    "fields": {
      "email": "Invalid email"
    }
  },
  "requestId": "..."
}
```

`fields` is present for request-body validation (Zod), unique-constraint conflicts, and related-record dependency failures that map to a JSON body property. Field keys match JSON body property names.

`DEPENDENCY_ERROR` is returned when a related record is missing (foreign key or referenced id) or a required backend dependency such as PostgreSQL cannot be reached. When the missing relation is a request field, `fields` includes that property.

Common codes: `VALIDATION_ERROR`, `DEPENDENCY_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `TOTP_INVALID`.

## Authentication

Browser clients authenticate with HTTP-only session cookies. Login and register set `vs_session` (HTTP-only) and `vs_csrf`. They do **not** return a bearer token.

If the account has two-factor authentication enabled, `POST /api/v1/auth/login` does **not** set a session. It returns `{ totpRequired: true, challengeToken }`. Complete sign-in with `POST /api/v1/auth/login/totp` using the challenge token plus a 6-digit authenticator code or a one-time backup code. Challenge tokens expire in five minutes.

Users enable or disable 2FA for themselves from Settings (`POST /api/v1/auth/2fa/setup`, `/2fa/enable`, `/2fa/disable`). The authenticator secret is encrypted at rest. Backup codes are hashed; plaintext codes are returned only when 2FA is first enabled.

The dashboard origin must be allowlisted (`CORS_ORIGINS`, with localhost defaults in development) so credentialed `fetch` from `:5173` is not blocked by the browser.

Mutating cookie-authenticated requests must send `x-csrf-token` matching the CSRF token from login/register/`GET /auth/me`.

Programmatic clients may still use `Authorization: Bearer <api-key>`.

`organizationId` is taken from the route and checked server-side. Clients cannot grant themselves access to another organization by sending an organization id in the body.

## Endpoints

### Auth

- `POST /api/v1/auth/register` — create SUPER_ADMIN user + organization, start session
- `POST /api/v1/auth/login` — session cookies, or a TOTP challenge when 2FA is on
- `POST /api/v1/auth/login/totp` — complete 2FA login
- `POST /api/v1/auth/2fa/setup` — start authenticator enrollment (current user)
- `POST /api/v1/auth/2fa/enable` — confirm enrollment; backup codes returned once
- `POST /api/v1/auth/2fa/disable` — turn 2FA off (password + code)
- `POST /api/v1/auth/logout`
- `GET  /api/v1/auth/me`

### Organizations

- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/:organizationId` — `users.read`
- `PATCH /api/v1/organizations/:organizationId` — `users.manage`

### Users

- `GET /api/v1/organizations/:organizationId/users` — `users.read`
- `POST /api/v1/organizations/:organizationId/users` — `users.manage`
- `GET /api/v1/organizations/:organizationId/users/:userId` — `users.read`
- `PATCH /api/v1/organizations/:organizationId/users/:userId` — `users.manage` (name, password, `disabled`)

### Roles

- `GET /api/v1/organizations/:organizationId/roles` — `users.read`
- `POST /api/v1/organizations/:organizationId/roles` — `users.manage`
- `GET /api/v1/organizations/:organizationId/roles/:roleId` — `users.read`
- `POST /api/v1/organizations/:organizationId/users/:userId/roles` — `users.manage`
- `DELETE /api/v1/organizations/:organizationId/users/:userId/roles/:roleId` — `users.manage`

### Teams

- `GET /api/v1/organizations/:organizationId/teams` — `users.read`
- `POST /api/v1/organizations/:organizationId/teams` — `users.manage`
- `GET /api/v1/organizations/:organizationId/teams/:teamId` — `users.read`
- `PATCH /api/v1/organizations/:organizationId/teams/:teamId` — `users.manage`
- `DELETE /api/v1/organizations/:organizationId/teams/:teamId` — `users.manage`
- `GET /api/v1/organizations/:organizationId/teams/:teamId/members` — `users.read`
- `POST /api/v1/organizations/:organizationId/teams/:teamId/members` — `users.manage`
- `DELETE /api/v1/organizations/:organizationId/teams/:teamId/members/:userId` — `users.manage

### Permissions, API keys, audit

- `GET /api/v1/permissions`
- `GET /api/v1/organizations/:organizationId/api-keys` — `users.manage`
- `POST /api/v1/organizations/:organizationId/api-keys` — `users.manage`
- `DELETE /api/v1/organizations/:organizationId/api-keys/:apiKeyId` — `users.manage`
- `GET/POST /api/v1/organizations/:organizationId/s3-credentials` — list/create S3 service-account credentials; create returns the secret once
- `PATCH /api/v1/organizations/:organizationId/s3-credentials/:credentialId` — permissions, bucket restrictions, expiry
- `POST /api/v1/organizations/:organizationId/s3-credentials/:credentialId/revoke` — revoke
- `POST /api/v1/organizations/:organizationId/s3-credentials/:credentialId/rotate` — revoke old credential and return a new secret once
- `GET /api/v1/organizations/:organizationId/s3-credentials/service-accounts` — list service accounts
- `PATCH /api/v1/organizations/:organizationId/s3-credentials/service-accounts/:serviceAccountId` — enable, disable, or describe a service account
- `GET /api/v1/organizations/:organizationId/audit-logs` — `audit.read`; filters:
  `userId`, `action`, `resourceType`, `dateFrom`, `dateTo`, `result`, and `limit`.
  Entries include the actor, result, request id, IP address where available, and
  sanitized metadata. Passwords, credentials, authorization headers, presigned
  URLs, and file contents are never persisted.

### Storage (Phase 3)

Storage routes are flat rather than nested under `/organizations/:organizationId`.
The active organization is resolved server-side from the authenticated context:
an API key is pinned to its own organization, while session and JWT callers use
the httpOnly `vs_org` selector cookie, the `x-vaultstack-organization` header, or
their sole membership. The selector is re-validated against persisted memberships
on every request, so it can only ever select an organization the caller already
belongs to, and the RBAC check still runs afterwards.

- `POST /api/v1/auth/organization` — set the active organization selector

Storage providers (Phase 9). Secret keys are accepted on create/update only and
never returned. Dialects: `AWS_S3`, `CLOUDFLARE_R2`, `BACKBLAZE_B2`, `MINIO`,
`WASABI`, `DIGITALOCEAN_SPACES`, `GENERIC`. Arbitrary endpoints are SSRF-checked
(HTTPS required except MinIO; loopback/private/link-local blocked except MinIO).

- `GET    /api/v1/storage/providers` — `storage.read`
- `POST   /api/v1/storage/providers` — `storage.upload`
- `GET    /api/v1/storage/providers/:providerId` — `storage.read`
- `PATCH  /api/v1/storage/providers/:providerId` — `storage.upload`
- `DELETE /api/v1/storage/providers/:providerId` — `storage.delete` (refuses providers that still have buckets)
- `POST   /api/v1/storage/providers/:providerId/test` — `storage.upload`

Buckets:

- `GET    /api/v1/storage/buckets` — `storage.read`
- `POST   /api/v1/storage/buckets` — `storage.upload` (optional `storageProviderId`)
- `GET    /api/v1/storage/buckets/:bucketId` — `storage.read`
- `DELETE /api/v1/storage/buckets/:bucketId` — `storage.delete` (refuses a non-empty bucket)
- `PUT    /api/v1/storage/buckets/:bucketId/versioning` — `storage.upload` (`UNVERSIONED` | `ENABLED` | `SUSPENDED`)

Objects:

- `GET    /api/v1/storage/buckets/:bucketId/objects` — `storage.read` (`prefix`, `delimiter`, `limit`, `cursor`)
- `GET    /api/v1/storage/objects/:objectId` — `storage.read`
- `POST   /api/v1/storage/objects/:objectId/download-url` — `storage.read` (optional `versionId`)
- `DELETE /api/v1/storage/objects/:objectId` — `storage.delete` (delete marker when versioning is enabled; `?versionId=` permanently deletes that version)
- `GET    /api/v1/storage/objects/:objectId/versions` — `storage.read`
- `GET    /api/v1/storage/objects/:objectId/versions/:versionId` — `storage.read`
- `POST   /api/v1/storage/objects/:objectId/versions/:versionId/restore` — `storage.upload`
- `DELETE /api/v1/storage/objects/:objectId/versions/:versionId` — `storage.delete`
- `POST   /api/v1/storage/objects/:objectId/copy` — `storage.upload`
- `POST   /api/v1/storage/objects/:objectId/move` — `storage.upload` **and** `storage.delete`

Lifecycle policies (provider-independent; evaluated by the storage worker):

- `GET    /api/v1/storage/policies` — `storage.read`
- `POST   /api/v1/storage/policies` — `storage.upload` (`EXPIRE_CURRENT`, `EXPIRE_NONCURRENT`, `ABORT_INCOMPLETE_MULTIPART`, `EXPIRE_TEMPORARY`)
- `GET    /api/v1/storage/policies/:policyId` — `storage.read`
- `PATCH  /api/v1/storage/policies/:policyId` — `storage.upload`
- `DELETE /api/v1/storage/policies/:policyId` — `storage.delete`

Sharing (`storage.share`). Public identifiers are high-entropy tokens (`vs_sh_` + 32 random bytes), never sequential ids. Bytes are fetched through a short-lived VaultStack download token; filesystem paths and provider credentials are never returned.

Authenticated management:

- `POST   /api/v1/storage/objects/:objectId/shares` — create (`PRIVATE` \| `TEAM` \| `ORGANIZATION` \| `PUBLIC_LINK`; optional password, viewer/download flags, download limit, expiration)
- `GET    /api/v1/storage/shares` — list (`?objectId=`)
- `GET    /api/v1/storage/shares/:shareId`
- `PATCH  /api/v1/storage/shares/:shareId` — expiration, permissions, revoke
- `DELETE /api/v1/storage/shares/:shareId` — revoke

Public consumption (optional session for private/team/org shares):

- `GET  /api/v1/public/shares/:token` — inspect; `{ passwordRequired: true }` when locked
- `POST /api/v1/public/shares/:token/unlock` — password; rate-limited
- `POST /api/v1/public/shares/:token/download-url` — short-lived `GET /storage/objects/:id/content?token=`

Share error codes: `SHARE_LINK_NOT_FOUND`, `SHARE_LINK_EXPIRED`, `SHARE_LINK_REVOKED`, `SHARE_PASSWORD_REQUIRED`, `SHARE_PASSWORD_INVALID`, `SHARE_DOWNLOAD_LIMIT_REACHED`, `SHARE_ACCESS_DENIED`.

Uploads:

- `POST   /api/v1/storage/uploads/initiate` — `storage.upload`
- `POST   /api/v1/storage/uploads/:uploadId/complete` — `storage.upload`
- `DELETE /api/v1/storage/uploads/:uploadId` — `storage.upload`

Multipart uploads:

- `GET    /api/v1/storage/multipart-uploads` — `storage.read` (initiator's resumable sessions)
- `POST   /api/v1/storage/multipart-uploads` — `storage.upload` (requires declared `size`)
- `GET    /api/v1/storage/multipart-uploads/:uploadId` — `storage.read`
- `GET    /api/v1/storage/multipart-uploads/:uploadId/parts` — `storage.read`
- `PUT    /api/v1/storage/multipart-uploads/:uploadId/parts?partNumber=N` — `storage.upload`
- `POST   /api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/destination` — `storage.upload`
- `POST   /api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/confirm` — `storage.upload`
- `POST   /api/v1/storage/multipart-uploads/:uploadId/complete` — `storage.upload`
- `DELETE /api/v1/storage/multipart-uploads/:uploadId` — `storage.upload`

Byte transfer, authorized by a scoped short-lived token instead of a session,
so a signed URL works the way an S3 presigned URL does:

- `GET /api/v1/storage/objects/:objectId/content?token=...` — supports `Range`
- `PUT /api/v1/storage/uploads/:uploadId/content?token=...`
- `PUT /api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/content?token=...`

Responses return metadata only. Internal filesystem paths and physical keys are
never included:

```json
{
  "id": "...",
  "bucketId": "...",
  "key": "documents/report.pdf",
  "size": 123456,
  "contentType": "application/pdf",
  "etag": "...",
  "checksum": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Storage error codes: `STORAGE_BUCKET_NOT_FOUND`, `STORAGE_BUCKET_NOT_EMPTY`,
`STORAGE_OBJECT_NOT_FOUND`, `STORAGE_ACCESS_DENIED`,
`STORAGE_PROVIDER_UNAVAILABLE`, `STORAGE_UPLOAD_FAILED`,
`STORAGE_UPLOAD_NOT_FOUND`, `STORAGE_UPLOAD_EXPIRED`,
`STORAGE_UPLOAD_INVALID_STATE`, `STORAGE_CHECKSUM_MISMATCH`,
`STORAGE_SIZE_MISMATCH`, `STORAGE_OBJECT_TOO_LARGE`, `STORAGE_INVALID_KEY`,
`STORAGE_INVALID_BUCKET_NAME`, `STORAGE_MULTIPART_NOT_FOUND`,
`STORAGE_MULTIPART_INVALID_PART`, `STORAGE_NOT_IMPLEMENTED`,
`ORGANIZATION_CONTEXT_REQUIRED`, `SHARE_LINK_NOT_FOUND`, `SHARE_LINK_EXPIRED`,
`SHARE_LINK_REVOKED`, `SHARE_PASSWORD_REQUIRED`, `SHARE_PASSWORD_INVALID`,
`SHARE_DOWNLOAD_LIMIT_REACHED`, `SHARE_ACCESS_DENIED`.

See [../storage/architecture.md](../storage/architecture.md) for the flows and
security model.

### CI/CD artifacts

Metadata under `/api/v1/artifacts`. Organization context matches storage (cookie/header/API key). Bytes are stored as normal `StorageObject` rows in the org `vs-artifacts` bucket.

- `GET/POST    /api/v1/artifacts/projects` — `artifact.read` / `artifact.upload`
- `GET/PATCH/DELETE /api/v1/artifacts/projects/:projectId` — delete requires `artifact.delete`
- `GET/POST    /api/v1/artifacts/projects/:projectId/builds`
- `GET/PATCH/DELETE /api/v1/artifacts/projects/:projectId/builds/:buildId`
- `GET/POST    /api/v1/artifacts/projects/:projectId/builds/:buildId/artifacts` — initiate upload
- `GET        /api/v1/artifacts/projects/:projectId/artifacts`
- `GET        /api/v1/artifacts/projects/:projectId/releases`
- `GET/DELETE /api/v1/artifacts/:artifactId`
- `GET        /api/v1/artifacts/:artifactId/versions`
- `GET        /api/v1/artifacts/versions/:versionId`
- `POST       /api/v1/artifacts/versions/:versionId/complete` — `artifact.upload`
- `POST       /api/v1/artifacts/versions/:versionId/download-url` — `artifact.read`
- `POST       /api/v1/artifacts/versions/:versionId/release` — `artifact.upload`
- `DELETE     /api/v1/artifacts/versions/:versionId` — `artifact.delete`

Artifact error codes: `ARTIFACT_PROJECT_NOT_FOUND`, `ARTIFACT_BUILD_NOT_FOUND`,
`ARTIFACT_NOT_FOUND`, `ARTIFACT_VERSION_NOT_FOUND`, `ARTIFACT_RELEASE_CONFLICT`.

See [../artifacts/README.md](../artifacts/README.md).

### Backups

Metadata under `/api/v1/backups`. Archive bytes are `StorageObject` rows in the org `vs-backups` bucket.

- `GET        /api/v1/backups/summary` — `backup.read`
- `GET/POST   /api/v1/backups/schedules` — read / `backup.create`
- `GET/PATCH/DELETE /api/v1/backups/schedules/:scheduleId`
- `GET/POST   /api/v1/backups/jobs` — read / `backup.create`
- `GET        /api/v1/backups/jobs/:jobId`
- `GET        /api/v1/backups/jobs/:jobId/logs`
- `POST       /api/v1/backups/jobs/:jobId/cancel` — `backup.create`
- `POST       /api/v1/backups/jobs/:jobId/retry` — `backup.create`
- `GET        /api/v1/backups/snapshots`
- `GET/DELETE /api/v1/backups/snapshots/:snapshotId` — delete requires `backup.delete`
- `POST       /api/v1/backups/snapshots/:snapshotId/verify` — `backup.create`
- `POST       /api/v1/backups/snapshots/:snapshotId/restore` — `backup.restore`
- `GET/POST   /api/v1/backups/restore` — `backup.restore`
- `GET        /api/v1/backups/restore/:restoreId`

Backup error codes: `BACKUP_JOB_NOT_FOUND`, `BACKUP_SNAPSHOT_NOT_FOUND`,
`BACKUP_SCHEDULE_NOT_FOUND`, `BACKUP_RESTORE_NOT_FOUND`, `BACKUP_INVALID_STATE`,
`BACKUP_TARGET_FORBIDDEN`, `BACKUP_VERIFICATION_FAILED`.

See [../backups/README.md](../backups/README.md).

### Infrastructure monitoring

Live collector snapshots under `/api/v1/infrastructure`. Host metrics are process-wide; storage metrics are organization-scoped. There is **no** `/api/exec`, `/api/shell`, or other command-execution surface.

- `GET /api/v1/infrastructure/summary` — `infrastructure.read`
- `GET /api/v1/infrastructure/server` — CPU, RAM, load, network
- `GET /api/v1/infrastructure/disks` — physical disk and storage-root usage (`fs.statfs`)
- `GET /api/v1/infrastructure/storage` — bucket/object usage, upload activity, provider health, storage-root free space
- `GET /api/v1/infrastructure/docker` — Docker Engine over `DOCKER_SOCKET` (`/info`, `/containers/json` only)

A missing disk path, unhealthy provider, or unreachable Docker socket is returned in the payload (`degraded` / `unavailable`). The HTTP status remains `200`.

See [../../infrastructure/monitoring/README.md](../../infrastructure/monitoring/README.md).

### S3-compatible gateway

Mounted at `/api/v1/s3` when `S3_GATEWAY_ENABLED=true`. Phase 3 provides the
protocol foundation only; see
[../storage/s3-compatibility.md](../storage/s3-compatibility.md).
