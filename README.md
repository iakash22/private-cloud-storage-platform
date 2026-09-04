# VaultStack

Self-hosted private cloud storage management platform.

VaultStack provides S3-compatible object storage, file management, CI artifact storage, backups, monitoring, RBAC, API keys, audit logging, and a unified React administration dashboard.

**Phase 0** establishes the monorepo foundation only. Authentication, storage, backups, artifacts, and infrastructure management are not implemented yet.

## Repository structure

```text
apps/
  dashboard/          React + Vite admin dashboard shell
  api/                Express API with health endpoints

packages/
  ui/                 Shared UI components (shadcn-style primitives)
  types/              Shared TypeScript types
  validation/         Zod schemas
  api-client/         Typed API client
  config/             Environment validation
  logger/             Structured logging (Pino)
  auth/               Auth placeholder (future phase)
  testing/            Shared test utilities

services/
  backup-worker/      BullMQ worker skeleton
  artifact-worker/    BullMQ worker skeleton

infrastructure/
  docker/             Development Docker Compose
  postgres/           PostgreSQL notes
  redis/              Redis notes
  minio/              MinIO notes
  monitoring/         Monitoring placeholder

docs/                 Architecture and development docs
scripts/              Helper scripts
tests/e2e/            Playwright E2E tests
```

## Prerequisites

- **Windows + WSL2** (recommended for local development)
- **Node.js** 20+
- **pnpm** 9+
- **Docker Desktop** with WSL2 integration enabled

Run Node, pnpm, and Docker commands from your WSL2 Linux environment (Ubuntu), not PowerShell, for consistent paths and Docker socket access.

## Quick start

```bash
# Clone and enter the repository
cd private-cloud-storage-platform

# Copy environment template
cp .env.example .env

# Install dependencies
pnpm install

# Start PostgreSQL, Redis, and MinIO
pnpm docker:up

# Build workspace packages
pnpm build

# Start API and dashboard (separate terminals)
pnpm --filter @vaultstack/api dev
pnpm --filter @vaultstack/dashboard dev
```

Or use the helper script:

```bash
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

### Verify health

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Dashboard: http://localhost:5173  
API: http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers via Turborepo |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm docker:up` | Start development infrastructure |
| `pnpm docker:down` | Stop development infrastructure |

## Environment variables

See [`.env.example`](.env.example). Copy to `.env` and adjust for local development.

Never commit `.env` or expose secrets to the browser. MinIO secret keys and database credentials are server-side only.

## Documentation

- [System architecture](docs/architecture/system-architecture.md)
- [Development setup](docs/development/setup.md)
- [Testing](docs/development/testing.md)

## Architecture rules

- Express.js + TypeScript backend (no NestJS)
- PostgreSQL for metadata only; MinIO for object data
- Long-running work uses BullMQ + Redis workers
- Browser auth will use HTTP-only cookies (future phase)
- File uploads/downloads will use presigned S3 URLs (future phase)

See [`AGENTS.md`](AGENTS.md) for development rules.

## License

Private — all rights reserved.
