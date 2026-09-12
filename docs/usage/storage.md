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

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/storage/providers` | `storage.read` |
| `POST` | `/api/v1/storage/providers` | `storage.upload` |
| `GET` | `/api/v1/storage/providers/:providerId` | `storage.read` |
| `PATCH` | `/api/v1/storage/providers/:providerId` | `storage.upload` |
| `DELETE` | `/api/v1/storage/providers/:providerId` | `storage.delete` |
| `POST` | `/api/v1/storage/providers/:providerId/test` | `storage.upload` |

Create is for **S3-compatible** backends. Secrets never returned (`hasSecret` only). Blank secret on update keeps the stored credential.

## Routes — buckets

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/storage/buckets` | `storage.read` |
| `POST` | `/api/v1/storage/buckets` | `storage.upload` |
| `GET` | `/api/v1/storage/buckets/:bucketId` | `storage.read` |
| `DELETE` | `/api/v1/storage/buckets/:bucketId` | `storage.delete` |
| `PUT` | `/api/v1/storage/buckets/:bucketId/versioning` | `storage.upload` |

Create body:

```json
{ "name": "my-files", "storageProviderId": "<optional>", "versioning": "ENABLED" }
```

If you omit `storageProviderId`, the org **default** provider is used. The dashboard hides the provider dropdown when only one provider exists.

## Routes — objects

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/storage/buckets/:bucketId/objects` | `storage.read` |
| `GET` | `/api/v1/storage/objects/:objectId` | `storage.read` |
| `POST` | `/api/v1/storage/objects/:objectId/download-url` | `storage.read` |
| `DELETE` | `/api/v1/storage/objects/:objectId` | `storage.delete` |
| `GET` | `/api/v1/storage/objects/:objectId/versions` | `storage.read` |
| `GET` | `/api/v1/storage/objects/:objectId/versions/:versionId` | `storage.read` |
| `POST` | `/api/v1/storage/objects/:objectId/versions/:versionId/restore` | `storage.upload` |
| `DELETE` | `/api/v1/storage/objects/:objectId/versions/:versionId` | `storage.delete` |
| `POST` | `/api/v1/storage/objects/:objectId/copy` | `storage.upload` |
| `POST` | `/api/v1/storage/objects/:objectId/move` | `storage.upload` + `storage.delete` |

Download URL response: short-lived `GET` URL (token or provider-native), same idea as S3 GetObject presign.

## Dashboard

1. **Storage → Providers** — confirm `local` is Active.
2. **Storage → Buckets** — Create bucket (name only if single provider).
3. **Storage → Files** — upload/list objects in a bucket.

## Test

- [examples/02-storage-upload.sh](./examples/02-storage-upload.sh)
- Upload details: [uploads.md](./uploads.md)
- Architecture: [../storage/architecture.md](../storage/architecture.md)
- Local layout: [../storage/local-filesystem.md](../storage/local-filesystem.md)
