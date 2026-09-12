# VaultStack usage guide

How to use VaultStack from the dashboard **and** from your own apps (like AWS S3 + SDK), with routes, connectivity, and test scripts.

Interactive OpenAPI remains at `/api/docs` when the API is running. This folder is the **human how-to** layered on top of [`../api/README.md`](../api/README.md).

## Start here

| Goal | Doc |
| --- | --- |
| How features connect (provider → bucket → upload → project) | [connectivity.md](./connectivity.md) |
| Login, org context, API keys, S3 credentials | [auth-access.md](./auth-access.md) |
| Providers, buckets, objects, downloads | [storage.md](./storage.md) |
| Presigned / token upload flow (REST) | [uploads.md](./uploads.md) |
| CI/CD projects, builds, artifact upload | [artifacts.md](./artifacts.md) |
| AWS SDK / aws-cli against VaultStack | [s3-gateway.md](./s3-gateway.md) |
| Shares + lifecycle policies | [shares-policies.md](./shares-policies.md) |
| Backup schedules, jobs, snapshots | [backups.md](./backups.md) |
| Host / disk / Docker monitoring | [infrastructure.md](./infrastructure.md) |
| Full route catalog by feature | [route-catalog.md](./route-catalog.md) |
| Copy-paste curl / shell tests | [examples/](./examples/) |

## Two ways to talk to VaultStack

```text
Your app / CI
    │
    ├─ REST + Bearer API key (vs_ak_…)
    │     /api/v1/storage/...
    │     /api/v1/artifacts/...
    │     → initiate → PUT uploadUrl → complete
    │
    └─ AWS SigV4 service account (VSKA…)
          /api/v1/s3/...
          → PutObject / GetObject like S3
```

| Client style | Credential | Best for |
| --- | --- | --- |
| REST (fetch/curl) | `Authorization: Bearer vs_ak_…` | Artifacts, shares, backups, dashboard automation |
| S3 SDK | `VSKA…` + secret (SigV4) | Bucket I/O only, drop-in AWS client |

REST API keys **cannot** sign the S3 gateway. S3 credentials **cannot** be used as Bearer tokens.

## Quick local base URL

Default from `.env.example`:

```bash
export VS_API="${VITE_API_URL:-http://localhost:5000}"
```

Swagger: `$VS_API/api/docs`

## Suggested path for an external project (e.g. Opsiva)

1. Dashboard: create **Artifacts → Project** (+ optional Build), or create them via API.
2. Dashboard: **Access → API keys** → copy `vs_ak_…`.
3. From your app: follow [artifacts.md](./artifacts.md) (initiate → PUT → complete).
4. Optional: for raw buckets like S3, enable gateway + [s3-gateway.md](./s3-gateway.md).

Run the smoke scripts in [examples/](./examples/) against a running API.
