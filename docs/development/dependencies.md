# New dependencies

Phase 1 added these packages. Each is required for the backend foundation.

| Package                                         | Why                                                             |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `prisma` / `@prisma/client`                     | Type-safe PostgreSQL access, migrations, and seed for metadata  |
| `bcryptjs`                                      | Password hashing without native addons (works reliably in WSL)  |
| `jose`                                          | ESM-friendly JWT sign/verify for access tokens                  |
| `testcontainers` / `@testcontainers/postgresql` | Ephemeral PostgreSQL for integration tests                      |
| `zod` (API app)                                 | Request validation and `ZodError` mapping in Express middleware |

MinIO / S3 client libraries were removed from `apps/api` in Phase 1, because object storage was not part of that phase.

## Phase 3

Phase 3 adds the storage engine. These are the only new packages.

| Package                         | Why                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@aws-sdk/client-s3`            | S3 protocol client for `S3CompatibleStorageProvider`; works against AWS S3, R2, B2, MinIO, Spaces, Wasabi without vendor-specific code |
| `@aws-sdk/s3-request-presigner` | Generates provider-native presigned URLs, so the browser uploads and downloads directly without ever receiving storage credentials     |
| `@aws-sdk/lib-storage`          | Managed multipart upload helper for large streamed objects to S3-compatible backends                                                   |

## Phase 6

| Package  | Why                                                                                          |
| -------- | -------------------------------------------------------------------------------------------- |
| `bullmq` | Dedicated cleanup worker for expired multipart sessions, provider aborts, and orphan staging |

The worker is a separate process from the API:

```bash
pnpm --filter @vaultstack/api worker:cleanup
```

It uses `REDIS_URL` and repeats every 60 seconds. The same process runs multipart session cleanup and lifecycle policy evaluation. Do not run the worker in the API request process.

All three are confined to `apps/api/src/integrations/minio/` and
`apps/api/src/modules/storage/providers/s3-compatible/`. The local filesystem
provider — the primary production backend — uses only the Node standard library,
so nothing about S3 is required for VaultStack to store objects.

No new dependency was needed for:

- **The S3 gateway's XML.** The S3 wire format is a small fixed set of
  documents, so a focused ~40-line serializer with escaping is preferable to an
  XML library.
- **MinIO integration tests.** `testcontainers` was already a dependency for
  PostgreSQL, so the MinIO helper uses `GenericContainer`.
- **Signed URLs for the local provider.** `node:crypto` HMAC is sufficient.

## API documentation (OpenAPI)

| Package                     | Where                 | Why                                                                  |
| --------------------------- | --------------------- | -------------------------------------------------------------------- |
| `yaml`                      | `@vaultstack/openapi` | Parse the checked-in OpenAPI YAML spec at runtime                    |
| `swagger-ui-express`        | `apps/api`            | Serve interactive Swagger UI at `/api/docs` without exposing secrets |
| `@types/swagger-ui-express` | `apps/api` (dev)      | TypeScript types for Swagger UI middleware                           |

The OpenAPI spec (`packages/openapi/spec/openapi.yaml`) is the machine-readable source mirrored by Swagger UI. Markdown reference remains at `docs/api/README.md`. Both must stay aligned with routes and Zod schemas when APIs change.

## Two-factor authentication

| Package         | Where                    | Why                                                                                                                                                                   |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qrcode`        | `@vaultstack/auth`       | Render authenticator `otpauth://` URIs as SVG during 2FA enrollment. A hand-rolled QR encoder is not reliable; the secret is never sent to an external image service. |
| `@types/qrcode` | `@vaultstack/auth` (dev) | TypeScript types for `qrcode`                                                                                                                                         |
