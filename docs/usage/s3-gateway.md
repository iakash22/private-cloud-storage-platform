# S3 gateway — AWS SDK / aws-cli

Use VaultStack **like Amazon S3** for bucket object I/O. This is separate from the Artifacts REST API.

Canonical detail: [../storage/s3-gateway.md](../storage/s3-gateway.md).

## Enable

```env
S3_GATEWAY_ENABLED=true
S3_GATEWAY_REGION=vaultstack
```

Endpoint: `{host}/api/v1/s3`  
Path-style addressing required (`forcePathStyle: true`).

## Credentials

Create via REST (dashboard Access → service accounts) with permission `users.manage`:

`POST /api/v1/organizations/:organizationId/s3-credentials`

Returns `accessKeyId` (`VSKA…`) and `secretAccessKey` **once**.

Client env:

```env
S3_ENDPOINT=http://localhost:5000/api/v1/s3
S3_REGION=vaultstack
S3_ACCESS_KEY=VSKA...
S3_SECRET_KEY=...
```

## Auth rule

| Credential | Works on `/api/v1/s3`? | Works as `Bearer` REST? |
| --- | --- | --- |
| `VSKA…` SigV4 | Yes | No |
| `vs_ak_…` API key | No | Yes |

## Supported S3 ops (summary)

List/Create/Head/Delete Bucket · ListObjects(V2) · Put/Get/Head/Delete/Copy Object · Create/UploadPart/Complete/Abort Multipart.

## AWS SDK v3

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: process.env.S3_REGION ?? 'vaultstack',
  endpoint: process.env.S3_ENDPOINT!,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

await client.send(
  new PutObjectCommand({
    Bucket: 'test',
    Key: 'hello.txt',
    Body: 'hello from Opsiva',
  }),
);
```

## aws-cli

```bash
aws --endpoint-url "$S3_ENDPOINT" s3 cp ./file.bin s3://test/file.bin
aws --endpoint-url "$S3_ENDPOINT" s3 ls s3://test/
```

Configure region `vaultstack` and the `VSKA` access key / secret.

## When to use gateway vs artifacts REST

| Need | Use |
| --- | --- |
| Project / build / release metadata | [artifacts.md](./artifacts.md) REST |
| Generic bucket PutObject like S3 | This gateway |
| Local-only without AWS SDK | [uploads.md](./uploads.md) REST + API key |

## Test

- Integration: `apps/api/src/integration/phase5.s3-gateway.integration.test.ts`
- Snippet notes: [examples/04-s3-gateway.md](./examples/04-s3-gateway.md)
