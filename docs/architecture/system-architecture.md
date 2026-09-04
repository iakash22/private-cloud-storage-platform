# System Architecture

VaultStack is a self-hosted control plane for private cloud storage. It is designed to run initially in Docker on a Windows development machine (WSL2) and later deploy to an Ubuntu home server.

## High-level flow

```text
Browser
  ↓
React Dashboard (apps/dashboard)
  ↓
Express API (apps/api)
  ↓
PostgreSQL   Redis   MinIO
  ↓            ↓
metadata    BullMQ workers (services/*)
              ↓
            object/file data (MinIO)
```

## Components

### Dashboard

React + Vite + TypeScript frontend using shared UI components from `packages/ui`. TanStack libraries and full shadcn/ui integration will be expanded in later phases.

### API

Express + TypeScript service. Phase 0 exposes:

- `GET /health` — process liveness
- `GET /ready` — dependency readiness (PostgreSQL, Redis, MinIO)

Business routes (auth, storage, backups, etc.) are not implemented yet.

### Workers

`services/backup-worker` and `services/artifact-worker` are BullMQ worker skeletons connected to Redis. Job processing logic will be added in future phases.

### Shared packages

| Package | Purpose |
|---------|---------|
| `@vaultstack/types` | Shared TypeScript types |
| `@vaultstack/validation` | Zod schemas |
| `@vaultstack/config` | Environment validation |
| `@vaultstack/logger` | Structured logging with secret redaction |
| `@vaultstack/api-client` | Typed HTTP client |
| `@vaultstack/ui` | Shared React UI primitives |
| `@vaultstack/auth` | Auth placeholder |
| `@vaultstack/testing` | Test helpers |

## Data storage rules

- **PostgreSQL** stores metadata only (users, organizations, file indexes, backup jobs, etc.)
- **MinIO** stores object/file binaries via S3-compatible API
- File binaries must **never** be stored in PostgreSQL

## Security boundaries

- MinIO secret keys, database credentials, and Redis credentials stay server-side
- The browser never receives S3 secret keys
- Presigned URLs will be used for direct uploads/downloads (future phase)
- MinIO admin/console must not be exposed publicly in production

## Multi-tenancy (future)

Organizations will own resources. `organizationId` will be derived server-side from authenticated identity — never trusted from client input.

## Monorepo tooling

- **pnpm** workspaces
- **Turborepo** for task orchestration
- **TypeScript** strict mode
- **Vitest** for unit/integration tests
- **Playwright** for E2E tests

## Infrastructure (development)

Docker Compose (`infrastructure/docker/docker-compose.dev.yml`) provides:

- PostgreSQL 16
- Redis 7
- MinIO (+ bucket initialization)

Production deployment (Caddy, Tailscale, Restic) is planned but not part of Phase 0.
