# SDK client

`@vaultstack/api-client` is the app-ready TypeScript client for REST
automation. It uses global `fetch`, so Node 20+ and modern browsers are
supported.

## Install

This repository package is currently private. Use a workspace dependency, a
`file:` dependency, or build and copy `packages/api-client`; public npm
publishing is planned for a later phase.

```bash
pnpm add @vaultstack/api-client
```

Create an API key in **Access → API keys** and keep it in a secret manager:

```ts
import { VaultStackApiClient } from '@vaultstack/api-client';
import { readFile } from 'node:fs/promises';

const client = new VaultStackApiClient({
  baseUrl: process.env.VS_API!,
  apiKey: process.env.VS_KEY!,
});
```

API-key clients send `Authorization: Bearer …`, omit cookies and CSRF headers,
and use the active organization pinned to the key.

## One-shot uploads

`putObject` performs initiate → byte PUT → complete:

```ts
const object = await client.putObject({
  bucketId: process.env.VS_BUCKET_ID!,
  key: 'builds/app.zip',
  body: await readFile('app.zip'),
  contentType: 'application/zip',
});
```

Artifacts use the same flow and the automatic `vs-artifacts` bucket:

```ts
const version = await client.uploadArtifact({
  projectId: process.env.VS_PROJECT_ID!,
  buildId: process.env.VS_BUILD_ID!,
  name: 'app',
  fileName: 'app.zip',
  body: bytes,
  contentType: 'application/zip',
});
```

Bodies can be `Uint8Array`, `Blob`, a string, or a `ReadableStream`. Use the
existing multipart methods for large/resumable uploads.

## Optional S3 gateway

For bucket I/O through AWS SDK, install the optional peer:

```bash
pnpm add @aws-sdk/client-s3
```

```ts
import { createVaultStackS3Client } from '@vaultstack/api-client';

const s3 = await createVaultStackS3Client({
  endpoint: `${process.env.VS_API}/api/v1/s3`,
  region: 'us-east-1',
  accessKeyId: process.env.VSKA_ACCESS_KEY_ID!,
  secretAccessKey: process.env.VSKA_SECRET_ACCESS_KEY!,
});
```

Enable the gateway and create `VSKA…` service-account credentials before using
this helper. API keys do not sign S3 requests. Use `uploadArtifact` for CI
artifacts.

## Opsiva / THANOS

Production defaults are:

- `VS_API=https://api.ivaultstack.com`
- `VS_KEY=vs_ak_…` from Access → API keys
- S3 gateway endpoint: `https://s3.ivaultstack.com/api/v1/s3`

For local development, set `VS_API` to the API URL configured by
`VITE_API_URL`. Never put API keys or S3 secret keys in browser bundles.
