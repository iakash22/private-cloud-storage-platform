# Usage examples (test scripts)

Runnable smoke tests against a live VaultStack API.

## Prerequisites

1. API running (`pnpm` / Docker / Ubuntu service).
2. Dashboard: create an **API key** (`vs_ak_…`) for a user with storage + artifact permissions.
3. Optional: an existing bucket name / project+build for artifact script.

```bash
cd docs/usage/examples
cp env.example.sh env.local.sh   # edit secrets
source ./env.local.sh
```

Never commit `env.local.sh` (it holds API keys).

| Script | What it tests |
| --- | --- |
| [01-auth-api-key.sh](./01-auth-api-key.sh) | Bearer key → `/auth/me` |
| [02-storage-upload.sh](./02-storage-upload.sh) | Create/list bucket → initiate → PUT → complete → download-url |
| [03-artifact-upload.sh](./03-artifact-upload.sh) | Project build → initiate artifact → PUT → complete |
| [04-s3-gateway.md](./04-s3-gateway.md) | AWS SDK snippet for `/api/v1/s3` |

Requires `curl` and `jq` on PATH.
