# PostgreSQL

Phase 1 stores metadata only: users, organizations, teams, roles, permissions, API keys, and audit logs.

Never store file binaries here.

## Commands

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

Production Compose runs migrate **and** seed (permission catalog + system-role grants) before the API starts. The API also re-runs seed on boot so existing organizations get missing role permissions repaired.

Schema and migrations live in `packages/database/prisma/`.
