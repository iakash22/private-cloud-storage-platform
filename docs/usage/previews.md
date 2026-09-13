# Durable previews

Preview generation is asynchronous. The API creates a PostgreSQL-backed
`PreviewJob`, then BullMQ dispatches it to `preview-worker`.

```http
POST /api/v1/storage/objects/{objectId}/previews
Authorization: Bearer <api-key>
Content-Type: application/json

{"kind":"ARCHIVE"}
```

Poll `GET /api/v1/storage/previews/{jobId}` until `status` is `COMPLETED` or
`FAILED`. Archive results contain bounded member metadata only; archive
contents are never extracted into the public storage namespace. Supported
formats are ZIP, TAR, and TAR.GZ.

Office previews use LibreOffice in the dedicated worker image and publish a
PDF object under the reserved `_previews/` prefix. If LibreOffice is not
available, the job is marked `FAILED` with an actionable error.

The worker caps source input at 64 MiB, archive members at 10,000, and
expanded archive content at 512 MiB. These limits protect both HTTP requests
and background workers from decompression bombs.
