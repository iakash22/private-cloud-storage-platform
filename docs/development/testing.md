# Testing

VaultStack uses a layered testing strategy:

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Packages, API handlers, UI components |
| API | Supertest + Vitest | Express routes |
| E2E | Playwright | Dashboard + API smoke tests |
| Integration | Testcontainers | Future phases (live PostgreSQL/Redis/MinIO) |

## Unit and API tests

From the repository root:

```bash
pnpm test
```

Run tests for a single package:

```bash
pnpm --filter @vaultstack/api test
pnpm --filter @vaultstack/dashboard test
```

Watch mode (package-level):

```bash
pnpm --filter @vaultstack/api exec vitest
```

## Type checking and linting

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

## Build verification

```bash
pnpm build
```

Turborepo builds packages in dependency order.

## E2E tests (Playwright)

Playwright starts the API and dashboard dev servers automatically.

Prerequisites:

- Dependencies installed
- Workspace built (`pnpm build`) so workspace packages resolve
- Docker infrastructure running for full `/ready` checks (optional for basic E2E)

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E tests live in `tests/e2e/`.

## CI-style local checklist

```bash
cp .env.example .env
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docker:up
pnpm --filter @vaultstack/api dev &
sleep 3
curl -f http://localhost:3000/health
curl -f http://localhost:3000/ready
```

## Writing tests

- Every new feature requires tests (see `AGENTS.md`)
- Prefer testing behavior over implementation details
- API routes: Supertest against `createApp()` with mocked dependencies where appropriate
- UI: React Testing Library
- Do not log secrets in test output

## Future integration testing

`@vaultstack/testing` will gain Testcontainers helpers when features require live PostgreSQL, Redis, or MinIO during integration tests.
