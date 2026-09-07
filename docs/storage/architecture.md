# Storage architecture

## The rule everything else follows

**VaultStack owns the storage abstraction.** Local Linux filesystem storage is
the primary production backend. S3-compatible services — AWS S3, Cloudflare R2,
Backblaze B2, MinIO, DigitalOcean Spaces, Wasabi — are _integrations_.

MinIO is not the core storage engine and is not a hard dependency. The API
starts, serves, and passes its whole storage test suite with no MinIO container
anywhere. In `docker-compose.dev.yml`, MinIO sits behind an opt-in Compose
profile precisely so it cannot drift into being required.

## Layers

```
                        Browser
                           |
                           v
                    VaultStack API            authn, org isolation, RBAC
                           |
                    Storage Service           limits, physical naming, metadata
                           |
                    StorageProvider           the only storage interface
                     /            \
                    /              \
     LocalFilesystemStorageProvider  S3CompatibleStorageProvider
                 |                              |
                 v                              v
          Ubuntu disk                  AWS / R2 / B2 / MinIO / ...
```

Business logic depends on `StorageProvider` and nothing below it. There is no
`if (provider === 'minio')` anywhere in the services. Where backends genuinely
differ, the difference is expressed as a capability, not a branch:

```ts
interface StorageProviderCapabilities {
  nativePresignedUrls: boolean; // backend signs its own URLs
  nativeVersioning: boolean; // backend tracks version ids
  serverSideCopy: boolean; // backend copies without streaming
}
```

`ProviderRegistry` is the single place a provider type is switched on. Adding a
new S3-compatible vendor requires no code change at all; adding a genuinely new
backend means one new `StorageProvider` implementation and one registry entry.

## Source layout

| Path                                             | Contents                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `modules/storage/domain/`                        | `StorageProvider` interface, domain types, key validation, streaming integrity |
| `modules/storage/providers/local-filesystem/`    | Primary backend and its hardened path resolution                               |
| `modules/storage/providers/s3-compatible/`       | Any S3-compatible endpoint, via AWS SDK v3                                     |
| `modules/storage/providers/provider-registry.ts` | Builds and caches providers from database rows                                 |
| `modules/storage/repositories/`                  | Organization-scoped Prisma access                                              |
| `modules/storage/services/`                      | Bucket, object, upload, token, metrics services                                |
| `modules/storage/controllers/` + `*.router.ts`   | REST routes (session-authorized) and content routes (token-authorized)         |
| `integrations/minio/`                            | S3 client construction, connection config, health probe                        |
| `modules/s3-gateway/`                            | S3 protocol foundation: operation routing, XML, auth seam                      |

`integrations/minio/` holds no MinIO-specific behaviour beyond honouring legacy
`MINIO_*` variables as a development fallback. It builds a generic AWS SDK v3
client; MinIO is simply one endpoint that client can point at.

## Physical vs. logical addressing

This separation is the core security property of the storage engine.

|                    | Logical                     | Physical                                                        |
| ------------------ | --------------------------- | --------------------------------------------------------------- |
| Example            | `documents/2026/report.pdf` | `objects/vs-<bucket-id>/<org>/ab/<object-id>/<version-id>/data` |
| Source             | user supplied               | server generated                                                |
| Stored in          | PostgreSQL metadata         | filesystem / S3 key                                             |
| Reaches a provider | never                       | always                                                          |

Object keys are **metadata**. They are validated, stored, listed, and returned
to clients, but they never contribute to a filesystem path. The service layer
resolves a key to a physical location first; providers only ever see
server-generated identifiers:

```ts
interface StorageLocation {
  physicalBucket: string; // vs-<bucket-id>
  physicalKey: string; // <org>/<fanout>/<object-id>/<version-id>
}
```

Because of this, a key like `../../etc/passwd` is rejected as invalid input, and
even if it were not, it could not influence where bytes land.

## Bucket and object model

```
Organization
  ├── StorageProvider   type, non-secret config, status
  └── Bucket            name, region, versioning
        └── StorageObject      key, size, contentType, etag, checksum
              ├── ObjectVersion     physicalKey, isCurrent
              └── MultipartUpload
                    └── MultipartPart
```

Every storage row carries `organizationId`, and every repository query filters
on it. `StoragePolicy` and `ShareLink` exist as foundations for later phases;
Phase 3 authorizes exclusively through the Phase 2 RBAC system.

The Prisma model is named `StorageObject` rather than `Object`, because a
generated client export named `Object` collides with the TypeScript global.

## Upload flow

```
POST /uploads/initiate     validate key, check limits, reserve Upload row,
                           mint an authorized destination
        |
        v
PUT bytes                  streamed to the provider, hashed in flight
        |
        v
POST /uploads/:id/complete  verify size and checksum, publish metadata
```

The destination depends on the provider's capabilities, not its brand:

- **`nativePresignedUrls: true`** (S3-compatible): the browser receives a
  provider presigned `PUT` and uploads directly to the storage endpoint.
- **`nativePresignedUrls: false`** (local filesystem): the browser receives a
  VaultStack URL carrying a scoped HMAC token, and the API streams the body
  through to disk.

Either way the browser receives a short-lived, single-object URL and never a
storage credential.

Upload state is persisted and moves through `PENDING → UPLOADING → COMPLETING →
COMPLETED`, or to `FAILED`, `ABORTED`, or `EXPIRED`. Abandoned uploads and their
staged bytes are reclaimed rather than kept forever.

## Download flow

```
POST /objects/:id/download-url
   1. authenticate
   2. resolve organization from authenticated context
   3. check storage.read via RBAC
   4. load the object scoped to that organization
   5. mint a short-lived, object-scoped URL
   6. return the URL
```

Downloads stream with backpressure and support `Range` requests. Nothing is
buffered, so object size does not affect memory use.

## Streaming and integrity

All object data is streamed. There is no `Buffer.concat()` of object bodies
anywhere in the engine, and the global JSON body parser is explicitly skipped
for byte-transfer routes so it cannot buffer an upload.

`IntegrityMeter` is a `Transform` that measures size and computes MD5 and
SHA-256 in a single pass, and fails the stream the moment the configured size
ceiling is exceeded. MD5 backs S3-compatible ETags; SHA-256 is the VaultStack
checksum.

**ETags are not always MD5.** For a single-part object the ETag is the MD5 of
the content. For a multipart object it is the MD5 of the concatenated binary
part digests with a `-<partCount>` suffix. Treating an ETag as a content hash is
wrong, and the tests assert the difference.

Integrity is verified while bytes are still staged, so a corrupted upload is
never published as a readable object. A size or checksum mismatch is reported as
`STORAGE_SIZE_MISMATCH` or `STORAGE_CHECKSUM_MISMATCH`.

## Consistency between database and disk

Filesystem writes do not participate in PostgreSQL transactions, and the code
does not pretend otherwise. Instead, ordering is chosen so that the failure
modes are safe:

1. Bytes are written to a staging path and verified.
2. Bytes are `rename`d into their final location — atomic within a volume, so a
   reader sees a complete object or none at all.
3. Metadata is published in a single database transaction.

A crash between steps 2 and 3 leaves an unreferenced physical object, which is a
tracked orphan reclaimable by cleanup. The reverse — metadata pointing at bytes
that do not exist — is what this ordering avoids.

`move` is modelled the same way: copy to the destination, verify, then delete
the source. The source is never deleted first.

## Authorization

Every storage operation runs the same chain:

```
request → authentication → organization → permission → resource lookup → storage
```

Object and bucket ids are authorization boundaries, not handles. A request never
travels from an id straight to the filesystem: the resource is always loaded
scoped to the caller's organization first, so a valid id from another
organization resolves to nothing.

Organization identity is derived from the authenticated context, never from the
request body. For flat routes such as `/api/v1/storage/buckets`, the active
organization comes from an httpOnly selector cookie (or the
`x-vaultstack-organization` header, or a sole membership). The selector is only
ever a _selector_: it is re-validated against persisted memberships on every
request, so a forged value can at best select an organization the caller already
belongs to, and the RBAC check still runs afterwards.

## Observability

Structured Pino events plus in-process counters cover upload and download
counts, bytes transferred, operation duration, active uploads, failed uploads,
multipart activity, and provider errors. Request ids tie events to requests.

Secret keys, access keys, presigned URLs, passwords, and authorization headers
are never logged. Prometheus is deliberately not introduced here; it belongs to
a later phase.

## Error translation

Raw AWS SDK, filesystem, and Prisma errors never reach a response. They are
translated into stable codes: `STORAGE_BUCKET_NOT_FOUND`,
`STORAGE_OBJECT_NOT_FOUND`, `STORAGE_ACCESS_DENIED`,
`STORAGE_PROVIDER_UNAVAILABLE`, `STORAGE_UPLOAD_FAILED`,
`STORAGE_CHECKSUM_MISMATCH`, `STORAGE_INVALID_KEY`, and the rest of the
`STORAGE_*` family. Filesystem errno values and absolute paths stay server-side.

## Environment variables

See [`.env.example`](../../.env.example) for the annotated list. The essentials:

| Variable                                                                                | Purpose                                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `STORAGE_DRIVER`                                                                        | Default backend for new organizations: `local` or `s3`   |
| `STORAGE_LOCAL_ROOT`                                                                    | Root directory for object data; all paths stay inside it |
| `STORAGE_MAX_OBJECT_SIZE_BYTES`                                                         | Per-object ceiling, enforced mid-stream                  |
| `STORAGE_MAX_REQUEST_SIZE_BYTES`                                                        | Per-request ceiling                                      |
| `STORAGE_MULTIPART_MIN_PART_SIZE_BYTES`                                                 | Minimum non-final part size                              |
| `STORAGE_MULTIPART_MAX_PARTS`                                                           | Maximum parts per multipart upload                       |
| `STORAGE_MAX_METADATA_BYTES`                                                            | Custom metadata ceiling                                  |
| `STORAGE_MAX_KEY_LENGTH`                                                                | Object key ceiling, measured in bytes                    |
| `STORAGE_PRESIGNED_URL_TTL_SECONDS`                                                     | Download URL lifetime                                    |
| `STORAGE_UPLOAD_TTL_SECONDS`                                                            | Upload authorization lifetime                            |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_FORCE_PATH_STYLE` | S3-compatible connection, server-side only               |
| `S3_GATEWAY_ENABLED`                                                                    | Mounts the S3 gateway foundation                         |

No production path is hardcoded. `STORAGE_LOCAL_ROOT` is always configuration.

## Related documents

- [Local filesystem provider](./local-filesystem.md)
- [S3 compatibility and the gateway](./s3-compatibility.md)
- [MinIO for development](./minio-development.md)
