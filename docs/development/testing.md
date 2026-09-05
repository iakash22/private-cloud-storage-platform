# Testing

VaultStack uses a layered testing strategy:

| Layer       | Tool                    | Scope                                                   |
| ----------- | ----------------------- | ------------------------------------------------------- |
| Unit        | Vitest                  | Packages, authorization, validation, API handlers       |
| API         | Supertest + Vitest      | Express routes with mocked dependencies                 |
| Integration | Testcontainers + Vitest | Live PostgreSQL: migrations, orgs, users, RBAC, tenancy |
| E2E         | Playwright              | Dashboard + API smoke tests                             |

## Unit tests

```bash
pnpm test
pnpm test:unit
```

Use **Node 20+** inside WSL (`nvm use` reads `.nvmrc`). Node 18 can run the suite but is not the supported toolchain.

`pnpm test` and `pnpm test:unit` stay on mocked/unit files. They do not start Testcontainers.

## Integration tests

Requires **Docker Desktop with WSL2 integration** enabled for your Ubuntu distro. Testcontainers starts PostgreSQL 16.

```bash
docker info    # must work inside WSL
pnpm test:integration
```

If Testcontainers reports `Could not find a working container runtime strategy`, start Docker Desktop and confirm the Docker socket is available in WSL (`ls /var/run/docker.sock`). Do not run these tests from Windows PowerShell.

Coverage includes:

- database connection
- migrations and permission seed
- organization creation
- user creation
- role assignment
- `can(user, permission, resource)`
- cross-organization access prevention

## Type checking and linting

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

## E2E tests (Playwright)

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```
