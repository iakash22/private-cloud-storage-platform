# VaultStack Development Rules

1. Use TypeScript everywhere.
2. Existing applications must not be modified.
3. Backend framework is Express.js.
4. Do not introduce NestJS.
5. Use PostgreSQL only for metadata.
6. Actual files belong in MinIO/S3.
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