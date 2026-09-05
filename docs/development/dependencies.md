# New dependencies

Phase 1 added these packages. Each is required for the backend foundation.

| Package                                         | Why                                                             |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `prisma` / `@prisma/client`                     | Type-safe PostgreSQL access, migrations, and seed for metadata  |
| `bcryptjs`                                      | Password hashing without native addons (works reliably in WSL)  |
| `jose`                                          | ESM-friendly JWT sign/verify for access tokens                  |
| `testcontainers` / `@testcontainers/postgresql` | Ephemeral PostgreSQL for integration tests                      |
| `zod` (API app)                                 | Request validation and `ZodError` mapping in Express middleware |

MinIO / S3 client libraries were removed from `apps/api`. Object storage is not part of Phase 1.
