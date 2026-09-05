# System Architecture

VaultStack is a self-hosted control plane for private cloud storage. It is designed to run initially in Docker on a Windows development machine (WSL2) and later deploy to an Ubuntu home server.

## High-level flow

```text
Browser
  ↓
React Dashboard (apps/dashboard) — UI not part of Phase 2
  ↓
Express API (apps/api) — /api/v1
  ↓
PostgreSQL (Prisma metadata)
Redis (queues; workers remain skeletons)
```

MinIO is provisioned in development Compose but is **not used in Phase 1**.

## Components

### Dashboard

React + Vite + TypeScript frontend shell. No Phase 1 UI work.

### API

Express + TypeScript service.

Infrastructure:

- `GET /health` and `GET /api/v1/health` — process liveness
- `GET /ready` and `GET /api/v1/ready` — PostgreSQL + Redis

Business modules under `apps/api/src/modules/`:

- `auth/` — register, login, logout, HTTP-only sessions, CSRF, API keys, `can(user, permission, resource)`
- `users/`
- `organizations/`
- `teams/`
- `roles/`
- `permissions/`
- `audit/`

### Workers

`services/backup-worker` and `services/artifact-worker` remain BullMQ skeletons.

### Shared packages

| Package                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `@vaultstack/types`      | Shared TypeScript types and permission keys                   |
| `@vaultstack/validation` | Zod schemas                                                   |
| `@vaultstack/config`     | Environment validation                                        |
| `@vaultstack/logger`     | Structured logging with secret redaction                      |
| `@vaultstack/api-client` | Typed HTTP client (health)                                    |
| `@vaultstack/ui`         | Shared React UI primitives                                    |
| `@vaultstack/auth`       | Password hashing, session/CSRF tokens, cookies, JWT, API keys |
| `@vaultstack/database`   | Prisma schema, client, migrations, seed                       |
| `@vaultstack/testing`    | Test helpers and Testcontainers PostgreSQL                    |

## Data storage rules

- **PostgreSQL** stores metadata only (users, organizations, roles, API keys, sessions, audit logs)
- File binaries must **never** be stored in PostgreSQL
- Object storage (MinIO) is deferred past Phase 1

## Multi-tenancy

Organizations own resources. `organizationId` is taken from the authenticated membership + route and checked with `can()`. Client-supplied organization ids are not trusted for authorization.

## Monorepo tooling

- **pnpm** workspaces
- **Turborepo** for task orchestration
- **TypeScript** strict mode
- **Vitest** for unit/integration tests
- **Playwright** for E2E smoke tests
- **Prisma** for PostgreSQL migrations

## Infrastructure (development)

Docker Compose (`infrastructure/docker/docker-compose.dev.yml`) provides:

- PostgreSQL 16
- Redis 7
- MinIO (unused in Phase 1)
