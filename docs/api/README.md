# API documentation

All business APIs are served under `/api/v1`.

Infrastructure probes remain at `/health` and `/ready` (also mirrored at `/api/v1/health` and `/api/v1/ready`).

## Error envelope

Every error includes a request id:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action"
  },
  "requestId": "..."
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## Authentication

Browser clients authenticate with HTTP-only session cookies. Login and register set `vs_session` (HTTP-only) and `vs_csrf`. They do **not** return a bearer token.

Mutating cookie-authenticated requests must send `x-csrf-token` matching the CSRF token from login/register/`GET /auth/me`.

Programmatic clients may still use `Authorization: Bearer <api-key>`.

`organizationId` is taken from the route and checked server-side. Clients cannot grant themselves access to another organization by sending an organization id in the body.

## Endpoints

### Auth

- `POST /api/v1/auth/register` — create SUPER_ADMIN user + organization, start session
- `POST /api/v1/auth/login`
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

### Permissions, API keys, audit

- `GET /api/v1/permissions`
- `GET /api/v1/organizations/:organizationId/api-keys` — `users.manage`
- `POST /api/v1/organizations/:organizationId/api-keys` — `users.manage`
- `DELETE /api/v1/organizations/:organizationId/api-keys/:apiKeyId` — `users.manage`
- `GET /api/v1/organizations/:organizationId/audit-logs` — `audit.read`

### Storage (Phase 3)

Storage routes are flat rather than nested under `/organizations/:organizationId`.
The active organization is resolved server-side from the authenticated context:
an API key is pinned to its own organization, while session and JWT callers use
the httpOnly `vs_org` selector cookie, the `x-vaultstack-organization` header, or
their sole membership. The selector is re-validated against persisted memberships
on every request, so it can only ever select an organization the caller already
belongs to, and the RBAC check still runs afterwards.

- `POST /api/v1/auth/organization` — set the active organization selector

Buckets:

- `GET    /api/v1/storage/buckets` — `storage.read`
- `POST   /api/v1/storage/buckets` — `storage.upload`
- `GET    /api/v1/storage/buckets/:bucketId` — `storage.read`
- `DELETE /api/v1/storage/buckets/:bucketId` — `storage.delete` (refuses a non-empty bucket)

Objects:

- `GET    /api/v1/storage/buckets/:bucketId/objects` — `storage.read` (`prefix`, `delimiter`, `limit`, `cursor`)
- `GET    /api/v1/storage/objects/:objectId` — `storage.read`
- `POST   /api/v1/storage/objects/:objectId/download-url` — `storage.read`
- `DELETE /api/v1/storage/objects/:objectId` — `storage.delete`
- `POST   /api/v1/storage/objects/:objectId/copy` — `storage.upload`
- `POST   /api/v1/storage/objects/:objectId/move` — `storage.upload` **and** `storage.delete`

Uploads:

- `POST   /api/v1/storage/uploads/initiate` — `storage.upload`
- `POST   /api/v1/storage/uploads/:uploadId/complete` — `storage.upload`
- `DELETE /api/v1/storage/uploads/:uploadId` — `storage.upload`

Multipart uploads:

- `POST   /api/v1/storage/multipart-uploads` — `storage.upload`
- `PUT    /api/v1/storage/multipart-uploads/:uploadId/parts?partNumber=N` — `storage.upload`
- `POST   /api/v1/storage/multipart-uploads/:uploadId/complete` — `storage.upload`
- `DELETE /api/v1/storage/multipart-uploads/:uploadId` — `storage.upload`

Byte transfer, authorized by a scoped short-lived token instead of a session,
so a signed URL works the way an S3 presigned URL does:

- `GET /api/v1/storage/objects/:objectId/content?token=...` — supports `Range`
- `PUT /api/v1/storage/uploads/:uploadId/content?token=...`

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
`ORGANIZATION_CONTEXT_REQUIRED`.

See [../storage/architecture.md](../storage/architecture.md) for the flows and
security model.

### S3-compatible gateway

Mounted at `/api/v1/s3` when `S3_GATEWAY_ENABLED=true`. Phase 3 provides the
protocol foundation only; see
[../storage/s3-compatibility.md](../storage/s3-compatibility.md).

Backups are not implemented yet. Permission keys for that domain are seeded for
later phases.
