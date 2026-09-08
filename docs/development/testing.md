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

If Testcontainers reports `Could not find a working container runtime strategy`, start Docker Desktop, confirm the Docker socket is available in WSL (`ls /var/run/docker.sock`), and retry. Docker Engine 29 requires API 1.44+; the integration Vitest config sets `DOCKER_API_VERSION=1.44`. Do not run these tests from Windows PowerShell.

Coverage includes:

- database connection
- migrations and permission seed
- organization creation
- user creation
- role assignment
- `can(user, permission, resource)`
- cross-organization access prevention
- login success and invalid password
- disabled user
- logout and session expiry
- session fixation (session rotation on login)
- CSRF on cookie-authenticated mutations
- privilege escalation attempts
- login rate limiting
- Phase 3 storage integration, including a 100 MB multipart stream
- Phase 7 versioning: upload v1/v2, list versions, restore, delete markers, lifecycle expiration
- optional 1 GB and 5 GB+ multipart coverage behind `VAULTSTACK_LARGE_MULTIPART_TEST=1` (5 GB skips when the test volume has less than 6 GiB free)
- optional 1 GB and 5 GB+ multipart coverage behind `VAULTSTACK_LARGE_MULTIPART_TEST=1` (5 GB skips when the test volume has less than 6 GiB free)
- optional MinIO/S3 coverage in `phase3.minio.integration.test.ts`, including presigned multipart part uploads (not required for local CI)

## Type checking and linting

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

## E2E tests (Playwright)

Requires Docker Desktop (Postgres + Redis). `pnpm test:e2e` installs Chromium, starts Compose, runs migrations, and waits for `GET /ready` before tests.

On a fresh WSL distro, install Chromium's OS libraries once. Run this **without** `sudo` (`sudo pnpm` fails because pnpm is installed via nvm):

```bash
pnpm playwright:install-deps
pnpm test:e2e
```

Playwright will ask for your password and install the packages with apt.
