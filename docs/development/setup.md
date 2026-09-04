# Development Setup

This guide covers local development on **Windows with WSL2**.

## Prerequisites

1. **WSL2** with Ubuntu installed
2. **Docker Desktop** with WSL2 backend enabled
   - Enable integration for your Ubuntu distro in Docker Desktop settings
3. **Node.js 20+** inside WSL2 (use `nvm` or NodeSource)
4. **pnpm 9+**

```bash
corepack enable
corepack prepare pnpm@9.15.2 --activate
node --version   # should be >= 20 (see .nvmrc)
pnpm --version   # should be >= 9
docker --version
docker compose version
```

Install Node 20+ **inside WSL2**, not only on Windows. If `pnpm` resolves from `/mnt/c/Program Files/nodejs/`, upgrade Node in WSL (e.g. `nvm install 20 && nvm use 20`) so engine requirements and tooling behave consistently.

## Clone and configure

```bash
cd ~/projects/private-cloud-storage-platform
cp .env.example .env
```

Review `.env` and adjust values if needed. Defaults match the development Docker Compose file.

## Install dependencies

```bash
pnpm install
```

This also configures Husky pre-commit hooks via the `prepare` script.

## Start infrastructure

From WSL2:

```bash
pnpm docker:up
```

This starts:

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Metadata database |
| Redis | 6379 | Queues and cache |
| MinIO API | 9000 | S3-compatible storage |
| MinIO Console | 9001 | Local admin UI (dev only) |

Wait for containers to become healthy:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

## Build and run applications

```bash
pnpm build
```

Start services in separate terminals:

```bash
# Terminal 1 — API
pnpm --filter @vaultstack/api dev

# Terminal 2 — Dashboard
pnpm --filter @vaultstack/dashboard dev

# Optional — worker skeletons
pnpm --filter @vaultstack/backup-worker dev
pnpm --filter @vaultstack/artifact-worker dev
```

Or start all dev tasks:

```bash
pnpm dev
```

## Verify

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Open http://localhost:5173 for the dashboard shell.

## Windows + WSL2 notes

- Store the repository inside the WSL2 filesystem (e.g. `~/projects/...`) for best file I/O performance
- Run `pnpm`, `node`, and `docker` commands from WSL2, not Windows CMD/PowerShell
- Docker Desktop exposes the Docker socket to WSL2 distros when integration is enabled
- If port conflicts occur, stop local PostgreSQL/Redis services or change ports in `.env` and Compose

## Troubleshooting

### `/ready` returns 503

One or more dependencies are unreachable. Check Docker containers:

```bash
pnpm docker:logs
```

Common causes:

- Docker not running
- MinIO bucket not created (re-run `pnpm docker:up` so `minio-init` executes)
- Wrong credentials in `.env`

### pnpm install fails in `/mnt/c/...`

Move the repo into the WSL2 native filesystem.

### Permission errors on scripts

```bash
chmod +x scripts/*.sh
```

## Next steps

Phase 0 does not include authentication or business APIs. See [testing.md](./testing.md) for validation commands.
