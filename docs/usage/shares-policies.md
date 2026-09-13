# Shares and lifecycle policies

## Shares connectivity

```text
StorageObject → Share (vs_sh_… token)
                    │
                    ├─ PRIVATE / TEAM / ORGANIZATION (needs session membership)
                    └─ PUBLIC_LINK (± password, download limit, expiry)
                              │
                              ▼
                    short-lived download token URL
                    (never exposes filesystem paths or provider secrets)
```

Permission: `storage.share`.

## Routes — share management (authenticated)

| Method   | Path                                       |
| -------- | ------------------------------------------ |
| `POST`   | `/api/v1/storage/objects/:objectId/shares` |
| `GET`    | `/api/v1/storage/shares` (`?objectId=`)    |
| `GET`    | `/api/v1/storage/shares/:shareId`          |
| `PATCH`  | `/api/v1/storage/shares/:shareId`          |
| `DELETE` | `/api/v1/storage/shares/:shareId`          |

Create supports visibility `PRIVATE` | `TEAM` | `ORGANIZATION` | `PUBLIC_LINK`, optional password, viewer/download flags, download limit, expiration.

## Routes — public share consumption

| Method | Path                                        |
| ------ | ------------------------------------------- |
| `GET`  | `/api/v1/public/shares/:token`              |
| `POST` | `/api/v1/public/shares/:token/unlock`       |
| `POST` | `/api/v1/public/shares/:token/download-url` |
| `POST` | `/api/v1/public/shares/:token/preview-url`  |

Password unlock is rate-limited. Download returns a short-lived `GET …/objects/:id/content?token=`.

Error codes: `SHARE_LINK_NOT_FOUND`, `SHARE_LINK_EXPIRED`, `SHARE_LINK_REVOKED`, `SHARE_PASSWORD_REQUIRED`, `SHARE_PASSWORD_INVALID`, `SHARE_DOWNLOAD_LIMIT_REACHED`, `SHARE_ACCESS_DENIED`.

## Lifecycle policies

Provider-independent rules evaluated by the storage worker.

| Method   | Path                                 | Permission       |
| -------- | ------------------------------------ | ---------------- |
| `GET`    | `/api/v1/storage/policies`           | `storage.read`   |
| `POST`   | `/api/v1/storage/policies`           | `storage.upload` |
| `GET`    | `/api/v1/storage/policies/:policyId` | `storage.read`   |
| `PATCH`  | `/api/v1/storage/policies/:policyId` | `storage.upload` |
| `DELETE` | `/api/v1/storage/policies/:policyId` | `storage.delete` |

Policy types: `EXPIRE_CURRENT`, `EXPIRE_NONCURRENT`, `ABORT_INCOMPLETE_MULTIPART`, `EXPIRE_TEMPORARY`.

## Dashboard

- **Storage → Shares** — manage links
- **Storage → Policies** — lifecycle rules
- Public consumers open the share URL / token flow without a full dashboard login when `PUBLIC_LINK` is used.

Share inspect, preview, and download-url requests are recorded in the
organization audit log with share/object identifiers, request id, user-agent,
and proxy-derived IP address where available. Raw share tokens, passwords,
signed URLs, and file contents are never recorded. Preview URLs do not consume
download limits; download URLs do.

## Test

Covered under storage/share integration paths; see [../api/README.md](../api/README.md) Sharing section and [../development/testing.md](../development/testing.md).
