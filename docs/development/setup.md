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

Install Node 20+ **inside WSL2**, not only on Windows.

## Clone and configure

```bash
cd ~/projects/private-cloud-storage-platform
cp .env.example .env
```

Set `JWT_SECRET` to a long random value (32+ characters). Defaults match the development Docker Compose file.

## Install dependencies

```bash
pnpm install
```

This generates the Prisma client via `@vaultstack/database` and configures Husky hooks.

## Start infrastructure

From WSL2:

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

| Service    | Port        | Purpose                     |
| ---------- | ----------- | --------------------------- |
| PostgreSQL | 5432        | Metadata database (Phase 1) |
| Redis      | 6379        | Queues and cache            |
| MinIO      | 9000 / 9001 | Unused in Phase 1           |

## Build and run applications

```bash
pnpm build
```

```bash
# Terminal 1 — API
pnpm --filter @vaultstack/api dev

# Terminal 2 — Dashboard shell
pnpm --filter @vaultstack/dashboard dev
```

## Verify

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","password":"password123","name":"Owner","organizationName":"Acme"}'
curl -b cookies.txt http://localhost:3000/api/v1/auth/me
```

## Optional: email and realtime workers

Transactional email and SSE realtime share Redis with BullMQ. For full local behavior:

```bash
# Terminal 3 — workers (email delivery, folder ops, backups, lifecycle, …)
pnpm --filter @vaultstack/api worker:cleanup
```

Add to `.env` when testing Resend (see `.env.example`):

```bash
RESEND_API_KEY=re_…
EMAIL_FROM="VaultStack <onboarding@resend.dev>"
DASHBOARD_PUBLIC_URL=http://localhost:5173
```

Guide: [../usage/notifications.md](../usage/notifications.md).

## Next steps

See [testing.md](./testing.md), [../api/README.md](../api/README.md), [../usage/README.md](../usage/README.md), and [../security/README.md](../security/README.md).
