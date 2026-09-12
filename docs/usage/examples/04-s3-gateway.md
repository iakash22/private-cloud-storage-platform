# S3 gateway example (AWS SDK)

Requires `S3_GATEWAY_ENABLED=true` and a `VSKA…` credential from:

`POST /api/v1/organizations/:organizationId/s3-credentials`

```bash
export S3_ENDPOINT=http://localhost:5000/api/v1/s3
export S3_REGION=vaultstack
export S3_ACCESS_KEY=VSKA...
export S3_SECRET_KEY=...
```

```typescript
import { S3Client, PutObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: process.env.S3_REGION ?? 'vaultstack',
  endpoint: process.env.S3_ENDPOINT!,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

await client.send(new ListBucketsCommand({}));
await client.send(
  new PutObjectCommand({
    Bucket: 'test',
    Key: 'from-sdk.txt',
    Body: 'hello',
  }),
);
```

Integration test reference: `apps/api/src/integration/phase5.s3-gateway.integration.test.ts`.

Full guide: [../s3-gateway.md](../s3-gateway.md).
