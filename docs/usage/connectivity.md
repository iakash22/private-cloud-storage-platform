# Connectivity map

How VaultStack pieces connect when you store or upload data.

## Layers

```text
┌─────────────────────────────────────────────────────────────┐
│ Dashboard / your app / CI / AWS SDK                         │
└─────────────┬───────────────────────────────┬───────────────┘
              │ Bearer API key                │ SigV4 VSKA…
              ▼                               ▼
     /api/v1/storage|artifacts|…      /api/v1/s3 (gateway)
              │                               │
              └──────────────┬────────────────┘
                             ▼
                    Storage / Artifacts services
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         PostgreSQL     Bucket row     StorageProvider
         (metadata)     (logical)      (bytes)
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    LocalFilesystem              S3Compatible (MinIO/AWS/R2/…)
    STORAGE_LOCAL_ROOT           config.endpoint + keys
```

## Core relationships

| Concept | Lives in | Connects to |
| --- | --- | --- |
| **Organization** | Postgres | Every resource; API key / S3 credential is pinned to one org |
| **Storage provider** | Postgres + runtime registry | Where bytes are written (`local` or S3 dialect) |
| **Bucket** | Postgres logical container | One provider; `physicalPrefix` = `vs-<id>` or shared `config.bucket` |
| **Object / version** | Postgres metadata | Bytes at `physicalBucket` + `physicalKey` on provider |
| **Upload session** | Postgres | Temporary row until complete → `StorageObject` |
| **Artifact project** | Postgres | Builds → artifact versions → storage objects in `vs-artifacts` |
| **Backup snapshot** | Postgres | Archive objects in `vs-backups` |

## Local vs S3 provider (same APIs)

| | Local filesystem | S3-compatible provider |
| --- | --- | --- |
| Default | `STORAGE_DRIVER=local`, provider name `local` | Optional; add via Providers UI/API |
| Create bucket UI | No provider dropdown if only one provider | Dropdown when `providers.length > 1` |
| Upload URL | VaultStack HMAC token URL | Provider **presigned** PUT |
| Fill endpoint/keys on provider form? | **No** — rejected | **Yes** |

## Auto buckets

| Feature | Bucket name | Created when |
| --- | --- | --- |
| Artifacts | `vs-artifacts` | First artifact upload in the org |
| Backups | `vs-backups` | Backup engine needs storage |

You do **not** manually wire a project to a provider. The default (or selected) provider backs those buckets.

## Auth connectivity

```text
Browser session
  vs_session cookie + x-csrf-token + vs_org / x-vaultstack-organization
       │
API key (vs_ak_…)
  Authorization: Bearer …   (org pinned; no CSRF)
       │
S3 credential (VSKA…)
  AWS SigV4 only on /api/v1/s3
```

Permissions are checked **server-side** on every route (`storage.*`, `artifact.*`, `backup.*`, …).

## Upload connectivity (REST)

```text
POST .../initiate  ──► { uploadUrl, headers, upload|version id }
PUT  uploadUrl     ──► raw bytes (token or real S3 URL)
POST .../complete  ──► metadata object / AVAILABLE version
```

Same pattern for:

- Storage: `/api/v1/storage/uploads/...`
- Artifacts: `/api/v1/artifacts/.../artifacts` then `/versions/:id/complete`

## Dashboard connectivity (where to click)

| Need | Dashboard path |
| --- | --- |
| Create API key | Access / Settings → API keys |
| Create S3 credential | Access → Service accounts / S3 credentials |
| See `local` provider | Storage → Providers |
| Create logical bucket | Storage → Buckets (auto-uses default provider) |
| Upload files in UI | Storage → Files (pick bucket) |
| Project CI artifacts | Artifacts → Project → Build → Upload artifact |
| Enable AWS-style gateway | Server env `S3_GATEWAY_ENABLED=true` + S3 credentials |

## Related architecture docs

- [../storage/architecture.md](../storage/architecture.md)
- [../artifacts/README.md](../artifacts/README.md)
- [../storage/s3-gateway.md](../storage/s3-gateway.md)
- [../architecture/system-architecture.md](../architecture/system-architecture.md)
