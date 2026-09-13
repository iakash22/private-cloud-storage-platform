# Storage — providers, buckets, objects

Logical buckets and objects in PostgreSQL; bytes on a `StorageProvider` (local disk or S3-compatible).

## Connectivity

```text
Provider (local | S3 dialect)
    └── Bucket (logical name: test, vs-artifacts, …)
            └── Object (key) → versions / uploads
```

- **Local provider** (`local`): configured by `STORAGE_DRIVER=local` + `STORAGE_LOCAL_ROOT`. Do **not** fill endpoint/access/secret on Edit provider.
- **S3 provider**: Add provider with dialect, endpoint, keys; optional **Existing bucket** = remote S3 bucket name to share (not a VaultStack bucket id).

Organization context: API key (pinned) or session `vs_org` / `x-vaultstack-organization`.

## Routes — providers

| Method   | Path                                         | Permission       |
| -------- | -------------------------------------------- | ---------------- |
| `GET`    | `/api/v1/storage/providers`                  | `storage.read`   |
| `POST`   | `/api/v1/storage/providers`                  | `storage.upload` |
| `GET`    | `/api/v1/storage/providers/:providerId`      | `storage.read`   |
| `PATCH`  | `/api/v1/storage/providers/:providerId`      | `storage.upload` |
| `DELETE` | `/api/v1/storage/providers/:providerId`      | `storage.delete` |
| `POST`   | `/api/v1/storage/providers/:providerId/test` | `storage.upload` |

Create is for **S3-compatible** backends. Secrets never returned (`hasSecret` only). Blank secret on update keeps the stored credential.

## Routes — buckets

| Method   | Path                                           | Permission       |
| -------- | ---------------------------------------------- | ---------------- |
| `GET`    | `/api/v1/storage/buckets`                      | `storage.read`   |
| `POST`   | `/api/v1/storage/buckets`                      | `storage.upload` |
| `GET`    | `/api/v1/storage/buckets/:bucketId`            | `storage.read`   |
| `DELETE` | `/api/v1/storage/buckets/:bucketId`            | `storage.delete` |
| `PUT`    | `/api/v1/storage/buckets/:bucketId/versioning` | `storage.upload` |
| `GET`    | `/api/v1/storage/buckets/:bucketId/summary`    | `storage.read`   |
| `POST`   | `/api/v1/storage/buckets/:bucketId/folders`    | `storage.upload` |

Create body:

```json
{ "name": "my-files", "storageProviderId": "<optional>", "versioning": "ENABLED" }
```

If you omit `storageProviderId`, the org **default** provider is used. The dashboard hides the provider dropdown when only one provider exists.

The bucket summary powers the control center and returns provider status,
object and folder usage, version count, active shares, running folder
operations, policy count, and normalized health (`HEALTHY`, `DEGRADED`, or
`DISABLED`).

## Routes — objects

Object listings accept an optional `search` query parameter for a
case-insensitive filename or full-key search. The dashboard debounces this
field before requesting the server, so search works across the bucket rather
than only across the currently loaded page.

Selected objects can store a description and normalized tag list through
`PATCH /api/v1/storage/objects/:objectId/metadata`. These values remain
PostgreSQL metadata; object bytes are never stored there.

| Method   | Path                                                            | Permission                          |
| -------- | --------------------------------------------------------------- | ----------------------------------- |
| `GET`    | `/api/v1/storage/buckets/:bucketId/objects`                     | `storage.read`                      |
| `GET`    | `/api/v1/storage/objects/:objectId`                             | `storage.read`                      |
| `POST`   | `/api/v1/storage/objects/:objectId/download-url`                | `storage.read`                      |
| `DELETE` | `/api/v1/storage/objects/:objectId`                             | `storage.delete`                    |
| `GET`    | `/api/v1/storage/objects/:objectId/versions`                    | `storage.read`                      |
| `GET`    | `/api/v1/storage/objects/:objectId/versions/:versionId`         | `storage.read`                      |
| `POST`   | `/api/v1/storage/objects/:objectId/versions/:versionId/restore` | `storage.upload`                    |
| `DELETE` | `/api/v1/storage/objects/:objectId/versions/:versionId`         | `storage.delete`                    |
| `POST`   | `/api/v1/storage/objects/:objectId/copy`                        | `storage.upload`                    |
| `POST`   | `/api/v1/storage/objects/:objectId/move`                        | `storage.upload` + `storage.delete` |

Download URL response: short-lived `GET` URL (token or provider-native), same idea as S3 GetObject presign.

### Folders and prefixes

VaultStack folders are provider-neutral object-key prefixes. Creating an empty
folder creates a zero-byte marker ending in `/`; ordinary dashboard listings
hide that marker while delimiter-aware listings expose the folder.

```http
POST /api/v1/storage/buckets/:bucketId/folders
Authorization: Bearer <api-key>
Content-Type: application/json

{"name":"reports","parentPrefix":"documents/2026/"}
```

Uploads made while browsing `documents/2026/` use that prefix in their object
key. The API rejects traversal-shaped, absolute, backslash-containing, and
control-character folder names.

## Dashboard

1. **Storage → Providers** — confirm `local` is Active.
2. **Storage → Buckets** — Create bucket (name only if single provider).
3. **Storage → Files** — upload/list objects in a bucket.

## MinIO setup

MinIO is optional in development and is not required by the local filesystem
backend:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml --profile minio up -d
```

Then add a provider with:

```json
{
  "name": "Local MinIO",
  "dialect": "MINIO",
  "endpoint": "http://localhost:9000",
  "region": "us-east-1",
  "bucket": "vaultstack",
  "forcePathStyle": true,
  "tls": false,
  "accessKeyId": "vaultstack_minio",
  "secretAccessKey": "<MINIO_ROOT_PASSWORD>"
}
```

Use the API key from **Access → API keys** for REST calls. Provider credentials
are accepted only by the server and are never returned to the browser:

```bash
curl -X POST "$VS_API/api/v1/storage/providers" \
  -H "Authorization: Bearer $VS_KEY" \
  -H "Content-Type: application/json" \
  -d @minio-provider.json
```

After the provider is saved, create a VaultStack logical bucket and select the
MinIO provider. The logical bucket name is separate from MinIO's physical
bucket. For AWS SDK or `aws-cli` access, use the optional S3 gateway guide.

## Test

- [examples/02-storage-upload.sh](./examples/02-storage-upload.sh)
- Upload details: [uploads.md](./uploads.md)
- Architecture: [../storage/architecture.md](../storage/architecture.md)
- Local layout: [../storage/local-filesystem.md](../storage/local-filesystem.md)
