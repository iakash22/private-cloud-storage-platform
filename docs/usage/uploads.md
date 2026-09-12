# Uploads — REST initiate / PUT / complete

VaultStack’s equivalent of **S3 presigned URLs** for REST clients.

## Flow

```text
1. POST /api/v1/storage/uploads/initiate
      → { upload, uploadUrl, method: "PUT", expiresAt, headers? }

2. PUT  uploadUrl
      → raw file bytes
      (no Bearer header — auth is the token in the URL, or S3 signature)

3. POST /api/v1/storage/uploads/:uploadId/complete
      → { object: … }
```

| Backend | What `uploadUrl` is |
| --- | --- |
| Local filesystem | `$API/api/v1/storage/uploads/:id/content?token=…` |
| S3-compatible provider | Real provider-native presigned PUT (`size` **required** on initiate) |

## Routes — simple upload

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/storage/uploads/initiate` | `storage.upload` |
| `POST` | `/api/v1/storage/uploads/:uploadId/complete` | `storage.upload` |
| `DELETE` | `/api/v1/storage/uploads/:uploadId` | `storage.upload` |

Initiate body:

```json
{
  "bucketId": "<uuid>",
  "key": "reports/q1.pdf",
  "contentType": "application/pdf",
  "size": 12345
}
```

Complete body (optional): `{ "checksumSha256": "<64 hex>" }`.

## Routes — multipart

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/storage/multipart-uploads` | `storage.read` |
| `POST` | `/api/v1/storage/multipart-uploads` | `storage.upload` |
| `GET` | `/api/v1/storage/multipart-uploads/:uploadId` | `storage.read` |
| `GET` | `/api/v1/storage/multipart-uploads/:uploadId/parts` | `storage.read` |
| `PUT` | `/api/v1/storage/multipart-uploads/:uploadId/parts?partNumber=N` | `storage.upload` |
| `POST` | `/api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/destination` | `storage.upload` |
| `POST` | `/api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/confirm` | `storage.upload` |
| `POST` | `/api/v1/storage/multipart-uploads/:uploadId/complete` | `storage.upload` |
| `DELETE` | `/api/v1/storage/multipart-uploads/:uploadId` | `storage.upload` |

Multipart initiate requires declared `size`.

## Routes — byte transfer (token URLs)

No session / API key on these — the scoped token authorizes the call:

| Method | Path |
| --- | --- |
| `GET` | `/api/v1/storage/objects/:objectId/content?token=…` (`Range` supported) |
| `PUT` | `/api/v1/storage/uploads/:uploadId/content?token=…` |
| `PUT` | `/api/v1/storage/multipart-uploads/:uploadId/parts/:partNumber/content?token=…` |

## TypeScript example

```typescript
const headers = {
  Authorization: `Bearer ${process.env.VS_KEY}`,
  'Content-Type': 'application/json',
};

const initiated = await fetch(`${base}/api/v1/storage/uploads/initiate`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    bucketId,
    key: 'ci/report.pdf',
    contentType: 'application/pdf',
    size: bytes.byteLength,
  }),
}).then((r) => r.json());

await fetch(initiated.uploadUrl, {
  method: 'PUT',
  headers: initiated.headers ?? { 'Content-Type': 'application/pdf' },
  body: bytes,
});

await fetch(`${base}/api/v1/storage/uploads/${initiated.upload.id}/complete`, {
  method: 'POST',
  headers,
  body: '{}',
});
```

## Test

- Shell: [examples/02-storage-upload.sh](./examples/02-storage-upload.sh)
- Integration: `apps/api/src/integration/phase3.storage.integration.test.ts`
