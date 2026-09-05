# MinIO for development

## MinIO is optional

**Local filesystem storage is VaultStack's primary production storage backend.**
MinIO is a development and testing dependency with exactly four jobs:

1. S3 compatibility testing
2. Development integration testing
3. Validating the S3-compatible gateway
4. Future optional deployment as one S3-compatible target among many

MinIO is **not** the core storage engine, is **not** the source of truth for
local storage, and is **not** required to run VaultStack. Stopping the MinIO
container has no effect on local filesystem storage.

To keep that true rather than aspirational, MinIO sits behind a Compose profile
and is not started by default.

## Starting the stack

Without MinIO — the normal case, and what production resembles:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
```

With MinIO, when working on the S3 provider or the gateway:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml --profile minio up -d
```

The `minio` profile also runs a one-shot `minio-init` container that creates the
initial development bucket.

## Credentials

The Compose file contains no credentials. Both MinIO services read them from
your environment and fail fast if they are missing:

```bash
# .env — development values only, never committed
MINIO_ROOT_USER=vaultstack_minio
MINIO_ROOT_PASSWORD=<a throwaway development value>
```

`.env` is gitignored. Never put production credentials in a repository file, and
never reuse production credentials for development.

Endpoints once running:

| Service     | URL                   |
| ----------- | --------------------- |
| S3 API      | http://localhost:9000 |
| Web console | http://localhost:9001 |

## Pointing the API at MinIO

MinIO is reached through the generic S3 settings, because nothing in the
provider is MinIO-specific:

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=vaultstack_minio
S3_SECRET_KEY=<your development password>
S3_FORCE_PATH_STYLE=true      # MinIO does not serve virtual-host style buckets
```

Legacy `MINIO_*` variables are still honoured as a development fallback so
existing `.env` files keep working, but `S3_*` is the supported form.

To go back to the primary backend, set `STORAGE_DRIVER=local`. Existing S3-backed
buckets keep their own provider; the driver only decides what new organizations
get by default.

These values are server-side only. They are never sent to the browser, and the
browser never receives MinIO admin credentials or S3 secret keys — only
short-lived presigned URLs.

## Integration tests

S3 compatibility is tested against a real MinIO container via Testcontainers,
not a mocked SDK. `startTestMinio()` in `@vaultstack/testing` starts MinIO on a
random port, waits on its `/minio/health/live` endpoint, and returns connection
details. Test credentials are ephemeral and scoped to that container.

```bash
# Requires a working Docker daemon
pnpm --filter @vaultstack/api test:integration
```

Two integration suites exist:

| Suite                                | Requires                            |
| ------------------------------------ | ----------------------------------- |
| `phase3.storage.integration.test.ts` | PostgreSQL only — no MinIO anywhere |
| `phase3.minio.integration.test.ts`   | PostgreSQL and MinIO                |

That the first suite covers the full storage API without starting MinIO is
itself the assertion that MinIO is not a hard dependency.

### Docker on Windows

Testcontainers needs a reachable Docker daemon. On a Windows host developing in
WSL2, enable **Docker Desktop → Settings → Resources → WSL Integration** for
your distribution. Without it, `docker ps` fails inside WSL and both integration
suites will be skipped or fail to start. Unit tests, including the entire local
filesystem provider suite, need no Docker at all.

## Troubleshooting

| Symptom                            | Cause                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `set MINIO_ROOT_USER in your .env` | The `minio` profile was started without credentials in the environment |
| MinIO not running after `up -d`    | Expected — pass `--profile minio`                                      |
| `SignatureDoesNotMatch`            | `S3_FORCE_PATH_STYLE` is not `true`, or the secret key does not match  |
| Bucket not found on first use      | `minio-init` did not run; it is part of the `minio` profile            |
| Testcontainers cannot reach Docker | WSL integration disabled in Docker Desktop                             |

## Production note

MinIO is a legitimate production S3-compatible target if you choose to deploy
it, but it is one option among AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean
Spaces, and Wasabi. VaultStack's default and primary production backend remains
the local Linux filesystem, with object data on a persistent mount such as
`/srv/vaultstack/data` — never a container writable layer.
