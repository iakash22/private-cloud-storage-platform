# Bucket folders

## Current behavior

VaultStack buckets use object keys. Folders are represented by key prefixes,
not by PostgreSQL directories.

For example:

```text
marketing/brand/logo.svg
marketing/brand/press-kit.zip
```

The `marketing/brand/` folder is inferred from the shared prefix. The storage
API uses a prefix and `/` delimiter to return immediate child folders.

This design works with local filesystem storage, MinIO, AWS S3, Cloudflare R2,
Backblaze B2, Wasabi, and other S3-compatible providers.

## Browse a folder

Select a bucket in **Storage → Files**, then open a folder. The current bucket
and prefix are stored in the browser URL, so a folder view can be bookmarked
or shared with another authorized team member.

Conceptually, a folder request looks like:

```http
GET /api/v1/storage/buckets/:bucketId/objects?prefix=marketing/brand/&delimiter=/
```

The delimiter makes the API return immediate child folders instead of
flattening every nested object into one list.

## Upload into a folder

Open the destination folder before uploading. New files use the current prefix
as their key location:

```text
Current folder: marketing/brand/
Uploaded file: logo.svg
Object key:    marketing/brand/logo.svg
```

Folder uploads should preserve relative paths:

```text
Selected local folder: campaign/
campaign/index.html       → marketing/brand/campaign/index.html
campaign/assets/app.js    → marketing/brand/campaign/assets/app.js
```

## Planned folder actions

The folder roadmap includes:

- create empty folder;
- upload a complete directory;
- rename folder;
- move folder;
- copy folder;
- delete or restore folder;
- share folder read-only;
- bulk download;
- bulk move and delete;
- favorites and tags;
- folder usage;
- folder activity;
- folder-level search.

Recursive actions will run as background jobs so large folders do not cause
HTTP timeouts. The dashboard will show progress, retry failures, and allow
authorized users to cancel pending work.

## Folder naming rules

Folder names should:

- use forward-slash-separated prefixes;
- not contain `..` path segments;
- not begin with an unintended absolute separator;
- stay within the configured object-key length limit;
- avoid ambiguous trailing whitespace;
- be normalized on the server before authorization and storage operations.

The server remains responsible for validation. Client-side validation is only
for immediate user feedback.

## Bucket connectivity

Each bucket is connected to a storage provider:

```text
Organization → Provider → Bucket → Folder prefix → Object
```

When troubleshooting a folder or upload, check these areas in order:

1. Bucket exists and belongs to the active organization.
2. The bucket points to the expected provider.
3. The provider connection test succeeds.
4. The current user has storage read or upload permission.
5. The object key contains the expected prefix.
6. The upload or recursive operation has completed.
7. Audit activity contains the corresponding action.

Provider credentials and secret keys must never be exposed in the browser.
Uploads and downloads should continue to use VaultStack-issued or provider
presigned URLs.

## S3 compatibility

Folders are a user-interface concept over object keys. S3 clients can still
write keys directly:

```text
reports/2026/summary.pdf
```

The dashboard should discover that prefix during the next listing operation.
Conversely, a folder created through the dashboard should remain accessible
through S3-compatible APIs.

References:

- [AWS: Organizing objects using prefixes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html)
- [AWS: ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)
- [AWS: S3 console folders](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html)

## Recommended usage patterns

Use predictable prefixes for:

- projects: `projects/<project>/...`
- environments: `environments/<environment>/...`
- dates: `yyyy/mm/dd/...`
- customers: `customers/<customer-id>/...`
- artifact versions: `artifacts/<project>/<version>/...`

Avoid putting rapidly changing, unbounded identifiers at the beginning of
every key when you expect high request volume. Keep related objects grouped
under a meaningful prefix, but design prefixes that can be distributed across
the provider when scale increases.

## Safety for destructive actions

Moving, renaming, and deleting a folder can affect many objects. Before
confirming a destructive action, the UI should show:

- source prefix;
- destination prefix, if applicable;
- estimated object count;
- estimated byte count when available;
- versioning behavior;
- whether shared links are affected;
- whether the operation can be restored;
- required permission.

The server must repeat these checks and write an audit event. A client-side
confirmation dialog is not an authorization boundary.

## Recursive folder operations

Move, copy, and delete operations are queued because they may affect many
objects:

```http
POST /api/v1/storage/folder-operations
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "bucketId": "bucket-id",
  "operation": "MOVE",
  "sourcePrefix": "documents/old/",
  "destinationPrefix": "documents/archive/"
}
```

Poll the returned job with
`GET /api/v1/storage/folder-operations/:jobId`. Jobs expose processed object
counts, total counts, failure counts, the last cursor, and an error message.
Failed jobs can be retried and running jobs can be cancelled.

The worker processes bounded pages and persists its cursor after each object.
Retries therefore resume from the last successful key instead of restarting
the entire folder.
