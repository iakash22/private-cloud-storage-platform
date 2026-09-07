---
name: phase6-large-multipart
overview: "Extend the existing Phase 3 multipart engine end-to-end. Use a hybrid operational model: a dedicated BullMQ cleanup process, resumable browser session metadata with file re-selection after reload, in-session pause/resume, S3 presigned part uploads, and scoped local part-token URLs."
todos:
  - id: session-contracts
    content: Add multipart persistence fields, public types, validation, and migration
    status: completed
  - id: service-security
    content: Harden multipart lifecycle, authorization, limits, checksum, and exact completion validation
    status: in_progress
  - id: provider-transfers
    content: Implement local token transfers, S3 presigned parts, capacity checks, and provider part inspection
    status: pending
  - id: api-cleanup
    content: Add resumable REST/content routes and BullMQ cleanup worker
    status: pending
  - id: client-dashboard
    content: Implement bounded-concurrency multipart client plus dashboard pause/resume/retry UX
    status: pending
  - id: tests-docs
    content: Add large-file/security/failure tests, run Phase 3 regressions, and document operations
    status: pending
isProject: false
---

# Phase 6 Large Multipart Storage

## 1. Extend session contracts and persistence
- Add declared total size and activity/expiry tracking to `MultipartUpload` in [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma), with a forward migration and indexes for active/stale sessions.
- Add public multipart session/part/transfer descriptor types in [packages/types/src/index.ts](packages/types/src/index.ts) and Zod validation for initiate, part destination, confirmation, completion, and status/list-parts requests in [packages/validation/src/storage.schemas.ts](packages/validation/src/storage.schemas.ts).
- Expose session status and recorded parts so clients can safely resume; return only organization-scoped public metadata.

## 2. Harden the multipart service and authorization
- Extend [apps/api/src/modules/storage/services/upload.service.ts](apps/api/src/modules/storage/services/upload.service.ts) and [apps/api/src/modules/storage/repositories/upload.repository.ts](apps/api/src/modules/storage/repositories/upload.repository.ts) to enforce organization, initiator, status, expiry, declared-size, request-size, part-count, unique-part, checksum, and exact completion-set checks.
- Make retries idempotently replace a numbered part; update last activity after successful work; reject completion/abort after invalid state or expiry; retain safe abort semantics for authorized cancellation.
- Add per-part audit/metrics and stable errors without logging tokens, paths, or provider credentials.

## 3. Add provider-neutral direct part destinations
- Extend [apps/api/src/modules/storage/domain/storage-provider.ts](apps/api/src/modules/storage/domain/storage-provider.ts) and storage types with capabilities for multipart part destinations, provider-side part inspection, and capacity checks—business logic will branch only on capabilities, never concrete provider type.
- In [apps/api/src/modules/storage/providers/s3-compatible/s3-compatible.provider.ts](apps/api/src/modules/storage/providers/s3-compatible/s3-compatible.provider.ts), use native S3 multipart operations, presigned `UploadPart` URLs, checksum-bound headers, provider-confirmed ETags/checksums, and native abort/list-parts.
- In [apps/api/src/modules/storage/providers/local-filesystem/local-filesystem.provider.ts](apps/api/src/modules/storage/providers/local-filesystem/local-filesystem.provider.ts), retain atomic temporary part files, stream with backpressure, validate checksums, clean failed partial writes, and use `statfs` for proactive capacity checks while preserving reactive `ENOSPC` handling.
- Extend [apps/api/src/modules/storage/services/storage-token.service.ts](apps/api/src/modules/storage/services/storage-token.service.ts) with short-lived, organization/upload/part-bound local transfer tokens.

## 4. Expose resumable APIs and schedule cleanup
- Add authenticated session/status, destination, confirmation, completion, and abort routes in [apps/api/src/modules/storage/storage.router.ts](apps/api/src/modules/storage/storage.router.ts); add a raw scoped-token part route in [apps/api/src/modules/storage/storage-content.router.ts](apps/api/src/modules/storage/storage-content.router.ts).
- Preserve server-side RBAC and organization checks before issuing every transfer destination; direct transfer credentials remain short-lived and part-scoped.
- Add a separate BullMQ worker entry under `apps/api/src/workers/` that periodically drains expired sessions, aborts provider multipart uploads, removes local orphan staging, and records cleanup metrics/audits. Add BullMQ to the API package and document the dependency and worker command.

## 5. Implement concurrent resumable client uploads
- Add typed multipart methods and a bounded-concurrency part pool to [packages/api-client/src/client.ts](packages/api-client/src/client.ts): slice files into bounded parts, request destinations, upload/confirm each part, retry with backoff, aggregate progress, cancel, pause, resume, and complete.
- Update [apps/dashboard/src/hooks/use-upload-queue.ts](apps/dashboard/src/hooks/use-upload-queue.ts) to choose multipart above a configured threshold, cap concurrent parts/files, persist non-secret session metadata plus a file fingerprint, support in-session pause/resume, and resume after reload only after the user re-selects the matching file.
- Extend existing UI progress components under [packages/ui/src/components/storage/](packages/ui/src/components/storage/) with per-upload pause/resume/retry/cancel states; never persist file bytes or transfer tokens.

## 6. Verify reliability, security, and regressions
- Expand service/provider tests for spoofed IDs/parts, cross-org and wrong-initiator access, expiry, retries, duplicate/concurrent parts, exact completion sets, limits, checksums, disk-full/provider failures, disconnect cleanup, and abandoned-session cleanup.
- Add local integration coverage for 100 MB multipart and large generated streams; gate 1 GB and 5 GB+ tests behind an explicit environment flag/hardware check so normal CI remains practical.
- Add S3/MinIO integration coverage for native presigned multipart upload and retries without making MinIO a requirement for local tests.
- Instrument generated streams and heap/RSS before/after to assert bounded memory rather than allocating full test objects.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, Phase 3 storage integration tests, and optional MinIO/S3 and extended-size suites; update storage/API docs and environment examples with limits, sizing, worker deployment, and recovery behavior.