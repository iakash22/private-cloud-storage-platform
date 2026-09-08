# S3 compatibility

VaultStack touches S3 in two independent directions. Keeping them apart matters:

1. **Outbound** — `S3CompatibleStorageProvider` lets VaultStack _store objects
   in_ any S3-compatible service. This is complete and tested against real
   MinIO.
2. **Inbound** — the S3 gateway lets external S3 clients _talk to VaultStack as
   if it were S3_. Phase 3 delivers the protocol foundation only.

## Outbound: storing objects in S3-compatible services

`S3CompatibleStorageProvider` is built on AWS SDK for JavaScript v3 and works
against any S3-compatible endpoint. There is no per-vendor branching.

| Setting               | Meaning                                        |
| --------------------- | ---------------------------------------------- |
| `S3_ENDPOINT`         | Endpoint URL; omit for real AWS S3             |
| `S3_REGION`           | Region, e.g. `us-east-1`                       |
| `S3_ACCESS_KEY`       | Access key id — **server-side only**           |
| `S3_SECRET_KEY`       | Secret access key — **server-side only**       |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO and most self-hosted gateways |

Verified provider families: AWS S3, Cloudflare R2, Backblaze B2, MinIO,
DigitalOcean Spaces, Wasabi, and other S3-compatible services. Vendor
differences are handled through endpoint and path-style configuration rather
than code paths.

Capabilities reported: `nativePresignedUrls: true`, `nativeVersioning: true`,
`serverSideCopy: true`. Copies are performed server-side by the backend rather
than streamed through the API.

Credentials for the server-wide default may live in `S3_*` environment variables
(`credentialRef: env:S3`). Organizations can also register their own
S3-compatible providers; those secrets are stored as AES-256-GCM ciphertext and
are never returned by the API. `StorageProvider.config` holds only non-secret
settings (dialect, endpoint, region, bucket, path style, TLS).
`describeS3Connection()` produces a redacted description for logs and health
output; access keys and secret keys never appear.

## Inbound: the S3-compatible gateway

`S3_GATEWAY_ENABLED=true` mounts the gateway at `/api/v1/s3`.

### What Phase 3 delivers

- **Operation resolution.** S3 encodes the operation in a combination of method,
  path depth, query parameters, and headers rather than in the path. That
  resolution is implemented and unit-tested: `?list-type=2` selects
  `ListObjectsV2`, `x-amz-copy-source` distinguishes `CopyObject` from
  `PutObject`, `?uploads` / `?uploadId` / `?partNumber` select the multipart
  operations.
- **The XML envelope.** Responses and errors are rendered as namespaced S3 XML.
  Every text value is escaped, so user-controlled object keys cannot inject
  markup.
- **Error mapping.** VaultStack codes map to S3 codes: `NoSuchBucket`,
  `NoSuchKey`, `NoSuchUpload`, `BucketNotEmpty`, `InvalidBucketName`,
  `InvalidArgument`, `BadDigest`, `EntityTooLarge`, `InvalidPart`,
  `NotImplemented`, `InvalidAccessKeyId`, `AccessDenied`. An S3 client receives a
  parseable S3 error, never a VaultStack JSON body, and never an internal
  message.
- **A pluggable authentication seam** (`S3AuthStrategy`).

### What Phase 3 does not deliver

Operation handlers are not yet wired to the storage services. Recognized
operations answer `501 NotImplemented` in S3 XML form.

The reason is authentication, not effort. S3 clients sign requests with
SigV4, which requires a credential store that can return a **secret key** for a
given access key id. Phase 2 stores API keys as one-way hashes — correctly — so
SigV4 cannot be verified against them. A signing-capable credential store is the
service-account work of a later phase.

Rather than ship a placeholder that authenticates, the default
`S3AuthStrategy` refuses every request:

```ts
export interface S3AuthStrategy {
  readonly name: string;
  authenticate(req: Request): Promise<S3Principal>;
}

export interface S3Principal {
  organizationId: string;
  principalId: string;
  accessKeyId: string;
}
```

The gateway is therefore inert until a real strategy is registered — a safer
default than an open door. Authentication runs before any storage lookup, so an
unauthenticated caller cannot probe which buckets or keys exist.

Browser authentication and S3 API authentication stay architecturally separate.
VaultStack session cookies are never accepted as S3 credentials, and the gateway
never issues them.

### Supported operation subset

The operations the gateway recognizes, and which future handlers will implement:

| Category  | Operations                                                                               |
| --------- | ---------------------------------------------------------------------------------------- |
| Service   | `ListBuckets`                                                                            |
| Bucket    | `CreateBucket`, `HeadBucket`, `DeleteBucket`                                             |
| Object    | `PutObject`, `GetObject`, `HeadObject`, `DeleteObject`, `CopyObject`                     |
| Listing   | `ListObjects`, `ListObjectsV2`                                                           |
| Multipart | `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, `AbortMultipartUpload` |

Anything outside this subset returns `NotImplemented` rather than being guessed
at. Adding an operation means adding a resolver case and a handler; the envelope
and error mapping already exist.

Complete AWS S3 compatibility is explicitly not a Phase 3 goal. Notably absent:
bucket policies, ACLs, lifecycle configuration, versioning operations, tagging,
CORS configuration, `DeleteObjects` (batch), and website configuration.

## ETag semantics

An ETag must not be assumed to equal a simple MD5.

- Single-part object: MD5 of the content.
- Multipart object: MD5 of the concatenated **binary** part digests, suffixed
  with `-<partCount>`.

Clients comparing ETags to locally computed MD5s will get false mismatches on
multipart objects. VaultStack additionally exposes a SHA-256 checksum, which is
a content hash regardless of how the object was uploaded.

## Connecting external applications

Once service accounts land, external S3 clients will connect with standard
configuration:

```bash
S3_ENDPOINT=https://s3.example.com
S3_REGION=us-east-1
S3_ACCESS_KEY=<issued by VaultStack>
S3_SECRET_KEY=<issued by VaultStack>
S3_BUCKET=<your bucket>
```

Expected clients include the AWS SDKs, `aws-cli`, Terraform, `rclone`, and other
S3-compatible tooling. Most self-hosted endpoints require path-style addressing
(`--endpoint-url` plus path style for `aws-cli`, `force_path_style` for
Terraform).

Credentials shown here are placeholders. Never commit real credentials, and
never embed them in browser-delivered code — the browser receives only
short-lived presigned URLs.

## Testing

`phase3.minio.integration.test.ts` exercises the outbound provider against a
**real MinIO container**, not a mocked SDK: health probes, bucket lifecycle,
upload and download, metadata, ranges, delete, server-side copy, prefix and
delimiter listing, pagination, a real multipart upload with S3's 5 MiB minimum
part size, abort, working presigned download and upload URLs, expired presigned
URL rejection, presigned scope confinement to one object, error translation for
missing objects and buckets, the size ceiling, and constant-memory streaming.

The gateway's operation resolution, XML rendering and escaping, and default auth
refusal are covered by unit tests in `s3-gateway.test.ts`, which need no
container.
