# PostgreSQL

Phase 1 stores metadata only: users, organizations, teams, roles, permissions, API keys, and audit logs.

Never store file binaries here.

## Commands

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

Schema and migrations live in `packages/database/prisma/`.
