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

## Integration tests

Requires Docker (Testcontainers starts PostgreSQL 16).

```bash
pnpm test:integration
```

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
