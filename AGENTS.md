# VaultStack Development Rules

1. Use TypeScript everywhere.
2. Existing applications must not be modified.
3. Backend framework is Express.js.
4. Do not introduce NestJS.
5. Use PostgreSQL only for metadata.
6. Actual files belong in a StorageProvider (local filesystem or S3-compatible), never in PostgreSQL. Local Linux filesystem storage is the primary production backend; MinIO/S3 are integrations, not requirements.
7. Never store file binaries in PostgreSQL.
8. Never expose MinIO admin credentials to frontend.
9. Never expose S3 secret keys to browser code.
10. Use presigned URLs for direct uploads/downloads.
11. Long-running operations must use BullMQ workers.
12. API authorization must be checked server-side.
13. Every organization-owned resource requires organizationId.
14. Every destructive operation requires authorization.
15. Important actions must create audit logs.
16. Never log secrets.
17. All new features require tests.
18. All APIs require validation using Zod.
19. Do not bypass TypeScript with any unless justified.
20. Do not introduce new dependencies without documenting why.
21. When changing API routes, request/response shapes, or auth behavior, update `packages/openapi/spec/openapi.yaml`, `docs/api/README.md`, and any affected examples in the same change.
22. When changing `packages/database/prisma/schema.prisma` (models, fields, or relations), update `docs/architecture/database-schema.md` in the same change.
23. READ `/Goal.md`.
24. Follow `docs/architecture/api-modules.md` for all API module work: class-based controllers/services, `AppContainer` wiring, Zod validation in `@vaultstack/validation`, security via `@vaultstack/auth` and `AuthenticationService` — do not add ad-hoc crypto or fat routers.
25. THANOS / `ivaultstack.com` production ops: read `docs/deployment/thanos.md` and `.cursor/rules/thanos-deployment.mdc` before changing deploy scripts, Compose overrides, or host paths. Never target Opsiva Redis/nginx ports.

VaultStack Storage Engine
        │
        ├── LocalFilesystemStorageProvider  ← PRIMARY
        │
        └── S3CompatibleStorageProvider
                ├── MinIO
                ├── AWS S3
                ├── Cloudflare R2
                ├── Backblaze B2
                ├── Wasabi
                └── other S3-compatible systems