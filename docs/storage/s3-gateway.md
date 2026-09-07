# VaultStack S3 Gateway

VaultStack exposes a native S3-compatible API at `/api/v1/s3`. External applications can use standard AWS SDKs, `aws-cli`, or MinIO clients against VaultStack directly. MinIO is **not** the gateway — it remains an optional outbound storage provider integration from Phase 3.

## Endpoint

```env
S3_ENDPOINT=https://your-vaultstack-host/api/v1/s3
S3_REGION=vaultstack
S3_ACCESS_KEY=VSKA...
S3_SECRET_KEY=...
```

Enable the gateway:

```env
S3_GATEWAY_ENABLED=true
S3_GATEWAY_REGION=vaultstack
```

Path-style addressing is required (`forcePathStyle: true` in AWS SDK v3).

## Authentication

- **AWS Signature Version 4** only
- **No browser cookies**, session tokens, or CSRF headers
- Each request is authenticated before any bucket/object lookup
- Access key ids use the `VSKA` prefix (VaultStack Key Access)

Authentication resolves:

| Field | Source |
|-------|--------|
| Organization | Credential record |
| Principal | Service account |
| Permissions | Credential permission set |
| Bucket scope | Optional `allowedBucketNames` |

Invalid signatures return `InvalidAccessKeyId`. Revoked, disabled, or expired credentials return `AccessDenied`.

## Credential lifecycle

Credentials are managed through the REST API (UI arrives in a later phase):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/organizations/:organizationId/s3-credentials` | Create credential (one-time secret display) |
| `GET` | `/api/v1/organizations/:organizationId/s3-credentials` | List metadata (never includes secrets) |
| `POST` | `/api/v1/organizations/:organizationId/s3-credentials/:credentialId/revoke` | Revoke |
| `POST` | `/api/v1/organizations/:organizationId/s3-credentials/:credentialId/rotate` | Rotate (revoke old, issue new linked credential) |

Secrets are encrypted at rest with AES-256-GCM using a key derived from `JWT_SECRET`. Plaintext secrets are never logged and are only returned in the create/rotate response.

Credential fields:

- `permissions`: subset of `storage.read`, `storage.upload`, `storage.delete`
- `allowedBucketNames`: empty means all buckets in the organization
- `expiresAt`: optional expiration timestamp

## Supported operations

| S3 operation | Storage backing |
|--------------|-----------------|
| `ListBuckets` | `BucketService.list` |
| `CreateBucket` | `BucketService.create` |
| `HeadBucket` | `BucketService.getByName` |
| `DeleteBucket` | `BucketService.remove` |
| `ListObjects` / `ListObjectsV2` | `ObjectService.list` |
| `PutObject` | `ObjectService.put` |
| `GetObject` | `ObjectService.openDownload` |
| `HeadObject` | `ObjectService.findByKey` |
| `DeleteObject` | `ObjectService.remove` |
| `CopyObject` | `ObjectService.copy` |
| `CreateMultipartUpload` | `UploadService.initiateMultipart` |
| `UploadPart` | `UploadService.uploadPart` |
| `CompleteMultipartUpload` | `UploadService.completeMultipart` |
| `AbortMultipartUpload` | `UploadService.abortMultipart` |

Physical filesystem paths and provider credentials are never exposed in S3 responses.

## Security model

1. **Separate auth boundary** — S3 SigV4 credentials are independent from browser sessions and REST API keys (which are hashed and cannot sign SigV4 requests).
2. **Organization isolation** — Every lookup includes `organizationId` from the authenticated credential.
3. **Least privilege** — Credentials carry explicit permission lists and optional bucket allow lists.
4. **Auditability** — Credential create/revoke/rotate and storage mutations attribute actions to the service account principal.
5. **Fail closed** — Unconfigured gateway auth rejects all traffic; invalid signatures never reach storage services.

## Client example (AWS SDK v3)

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'vaultstack',
  endpoint: 'https://your-vaultstack-host/api/v1/s3',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

await client.send(
  new PutObjectCommand({
    Bucket: 'my-bucket',
    Key: 'hello.txt',
    Body: 'hello',
  }),
);
```

## Testing

Integration coverage lives in `apps/api/src/integration/phase5.s3-gateway.integration.test.ts` and exercises:

- AWS SDK against the VaultStack gateway
- Valid, invalid, revoked, and expired credentials
- Read-only and bucket-restricted credentials
- Cross-organization isolation

Run:

```bash
pnpm --filter @vaultstack/api test:integration
```
