# Storage folders roadmap

## Purpose

This document defines how VaultStack should evolve from prefix-based object
browsing into a complete bucket and folder management experience.

The design preserves the existing storage architecture:

- PostgreSQL stores metadata only.
- Object bytes remain in a `StorageProvider`.
- Local filesystem storage remains the primary production backend.
- S3-compatible providers remain supported integrations.
- Long-running recursive operations run through BullMQ workers.
- Authorization and organization isolation are enforced server-side.

## Current state

Phase 1 virtual-folder support is implemented in the storage API and
dashboard. Phase 2 recursive move, copy, and delete operations now use durable
PostgreSQL jobs and a BullMQ worker.

VaultStack already supports folder-like navigation through object key prefixes.
For example:

```text
documents/2026/report.pdf
documents/2026/budget.xlsx
```

The dashboard stores the selected bucket and prefix in the URL, and the API
supports prefix and delimiter-aware object listing.

The current model does not yet provide:

- an explicit create-folder endpoint;
- folder metadata;
- folder-specific permissions;
- folder-level sharing;
- recursive operation jobs;
- folder usage summaries;
- a complete bucket control center.



## Storage model decision

Folders should remain virtual prefix views by default.

S3 general-purpose buckets are flat namespaces. A folder is normally inferred
from a shared key prefix and a `/` delimiter. A folder does not need a
PostgreSQL row merely to be displayed in the browser.

VaultStack may create an optional zero-byte marker object ending in `/` when a
user explicitly creates an empty folder:

```text
documents/2026/reports/
```

Marker objects must be hidden from the normal file list and treated as
folders by the dashboard.

A dedicated `Folder` metadata model should only be introduced when folders
need independent descriptions, tags, ACLs, comments, colors, or sharing
policies. This avoids synchronizing a database hierarchy with arbitrary keys
written through the S3 gateway.

References:

- [AWS: Organizing objects using prefixes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html)
- [AWS: ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)
- [AWS: Organizing objects in the S3 console using folders](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html)
- [Google Drive files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- [Google Drive permissions](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions)
- [Dropbox team files and namespaces](https://developers.dropbox.com/dbx-team-files-guide)



## Target listing contract

The bucket listing API should expose immediate child folders and objects
separately:

```json
{
  "bucketId": "bucket-id",
  "prefix": "documents/2026/",
  "delimiter": "/",
  "folders": [
    {
      "name": "reports",
      "prefix": "documents/2026/reports/",
      "objectCount": null
    }
  ],
  "objects": [],
  "nextCursor": null
}
```

Listing requirements:

1. Return immediate children by default.
2. Use cursor pagination.
3. Do not recursively scan a bucket for an ordinary browse request.
4. Return grouped prefixes as folders.
5. Hide folder marker objects from `objects`.
6. Preserve raw key access for S3-compatible clients.
7. Keep response ordering deterministic.
8. Make object and folder sorting explicit rather than implicit.



## Proposed API surface



### Create an empty folder

```http
POST /api/v1/storage/buckets/:bucketId/folders
```

```json
{
  "name": "reports",
  "parentPrefix": "documents/2026/"
}
```

The server must normalize the prefix, reject traversal segments, enforce key
length limits, verify organization ownership, and create the marker object
only after authorization succeeds.

### List a folder

```http
GET /api/v1/storage/buckets/:bucketId/objects?prefix=documents/2026/&delimiter=/
```

The existing object-list endpoint should remain compatible. The response can
be extended with a structured `folders` collection rather than introducing a
second incompatible browsing API.

### Start a recursive operation

```http
POST /api/v1/storage/folder-operations
```

```json
{
  "operation": "MOVE",
  "bucketId": "bucket-id",
  "sourcePrefix": "documents/old/",
  "destinationPrefix": "documents/archive/"
}
```

Return `202 Accepted` with a durable job identifier.

### Poll an operation

```http
GET /api/v1/storage/folder-operations/:jobId
```

Suggested status values:

```text
QUEUED
RUNNING
PAUSED
COMPLETED
FAILED
CANCELLED
```

The response should include processed count, total count when known, bytes
processed, failure count, and a resumable cursor.

## Recursive operation behavior

Folder rename, move, copy, and delete are key-prefix operations.

For a move:

1. Validate source and destination prefixes.
2. Reject equal or nested destinations that would cause recursion.
3. Enumerate source keys in bounded pages.
4. Copy each object to the destination key.
5. Preserve content type, metadata, checksums, and version behavior.
6. Delete the source only after the copy succeeds.
7. Persist progress after every page.
8. Retry failed items safely.
9. Emit audit events.
10. Mark the job complete only when all pages finish.

Operations must be idempotent. Retrying a page must not corrupt the destination
or create an uncontrolled number of duplicate metadata rows.

Delete should support two modes:

- move to VaultStack trash when recovery is possible;
- permanent deletion for explicitly authorized destructive operations.



## Folder permissions



### Initial phase

Use existing bucket-scoped permissions:

- `storage.read`
- `storage.upload`
- `storage.delete`
- `storage.share`

This keeps authorization predictable while folder browsing is introduced.

### Later phase

Add folder-specific ACLs only when there is a real requirement for delegated
access. A future folder permission should support:

- user access;
- team access;
- service-account access;
- read-only access;
- read/write access;
- delete permission;
- share permission;
- inheritance enabled or disabled.

Folder permissions must never be enforced only by the dashboard. Every object
read, upload, move, delete, and share operation must re-check access on the
server.

## Bucket control center

Each bucket should have connected sections for:

- Overview
- Files
- Usage
- Versioning
- Lifecycle policies
- Shares
- Activity
- Access policies
- Storage provider
- API/S3 access
- Backups
- Danger zone

The overview should show:

- provider name and health;
- versioning state;
- object count;
- approximate size;
- folder count when available;
- active shares;
- recent activity;
- active background jobs;
- latest backup state;
- lifecycle policy state.

Navigation should connect bucket, provider, policy, object, version, share,
preview, activity, and backup views instead of making them isolated pages.

## Search and metadata roadmap

Useful folder and object metadata includes:

- favorites;
- tags;
- descriptions;
- colors;
- project association;
- department;
- sensitivity classification;
- retention category;
- recent access;
- recent modification.

Suggested search filters:

- filename;
- full key;
- content type;
- size range;
- modified date;
- bucket;
- folder prefix;
- owner;
- tag;
- externally shared;
- versioned;
- processing status.

For the first release, PostgreSQL metadata search is sufficient. Trigram or
full-text indexes should be added before introducing a separate search system.

## Security requirements

Folder work must include:

- canonical prefix normalization;
- rejection of `..` and unsafe path segments;
- maximum key and prefix lengths;
- organization filtering in every query;
- server-side authorization on every operation;
- audit logs for create, move, copy, rename, delete, restore, and share;
- job ownership checks when polling status;
- protection against cross-bucket moves unless explicitly supported;
- explicit overwrite behavior;
- rate limits for recursive operations;
- no recursive operation performed inside an HTTP request.



## Delivery phases



### Phase 1: virtual folders

- structured folder listing;
- create-folder marker;
- breadcrumbs;
- upload into current prefix;
- folder marker hiding;
- URL and browser-history navigation;
- tests for prefix normalization and organization isolation.



### Phase 2: recursive operations

- durable folder operation model;
- BullMQ worker;
- move, copy, rename, and delete;
- progress, retry, cancellation, and audit events;
- failure recovery.



### Phase 3: bucket control center

- usage cards;
- provider connectivity;
- policies;
- versioning;
- shares;
- activity;
- backups;
- health indicators.



### Phase 4: search and metadata

- filename search (implemented as a case-insensitive server-side object-list
query);
- favorites and recent items (implemented in the dashboard preferences layer);
- tags and descriptions are implemented using the existing PostgreSQL object
metadata column;
- advanced object-list filters (content type, size range, modified date, folder
  prefix, share/version/processing flags) are implemented; trigram or full-text
  indexes remain optional follow-up when search volume grows.



### Phase 5: collaboration

- folder ACLs and team-folder access rules (implemented);
- folder collaboration dashboard and server-side rule management (implemented);
- audit events for grants and revocations (implemented);
- folder ACL enforcement across HTTP storage, recursive jobs, S3 gateway, and
  sharing is implemented; external collaboration controls (invitations, expiry,
  domain restrictions, cross-organization policy) remain follow-up work.



## Pending work



### Phase 4 — advanced search and metadata

- [x] Add advanced object filters for content type, size range, modified date,
  bucket, and folder prefix.
- [x] Add filters for externally shared, versioned, and processing-state
  objects.
- [ ] Add PostgreSQL trigram or full-text indexes before search volume requires
  a separate search service.
- [ ] Add dashboard tests for debounced search and metadata editing.



### Phase 5 — collaboration enforcement

- [x] Enforce folder ACLs during object listing, upload, download, sharing,
  restore, and recursive folder operations.
- [x] Resolve effective permissions from direct user rules and team
  membership, with the most-specific folder prefix taking precedence.
- [ ] Add folder-level share links with read-only and download controls.
- [x] Add shared-folder activity filtering and dashboard history.
- [ ] Add external collaboration controls: invitations, expiry, domain
  restrictions, revocation, and cross-organization policy checks.
- [x] Add authorization, organization-isolation, and team-membership tests for
  folder ACL and advanced-filter boundaries.



### Notifications and realtime (code complete; THANOS rollout pending)

- [x] Resend transactional email for auth, security, invitations, folder jobs,
  and backup jobs (`docs/usage/notifications.md`).
- [x] SSE realtime stream for session revoke, folder-operation progress, and
  backup job progress (`GET /api/v1/realtime/events`).
- [ ] Configure `RESEND_API_KEY`, `EMAIL_FROM`, and `DASHBOARD_PUBLIC_URL` on
  THANOS; verify worker processes the `email-delivery` queue.
- [ ] Smoke-test login-detected email, remote session revoke push, and job
  progress events in the production dashboard.



### Production rollout

- [ ] Apply storage migrations on THANOS, including advanced filter indexes
  (`20260913200000_advanced_storage_filters`) and folder-access integrity
  (`20260913201000_folder_access_integrity`).
- [ ] Rebuild and redeploy API, dashboard, and worker services.
- [ ] Verify role permissions, navigation, folder ACLs, team shares, and audit
  events in the deployed environment.
- [ ] Run upload, download, folder-operation, S3, backup, readiness, email, and
  realtime smoke tests.
- [ ] Complete the remaining operator checklist in
  `docs/deployment/thanos-pending.md`.



## Acceptance criteria for Phase 1

- A user can create an empty folder inside any authorized bucket.
- A user can navigate arbitrarily deep folder paths.
- Uploads use the current prefix.
- Empty folders remain visible.
- Marker objects are not shown as ordinary files.
- S3-compatible object listing remains functional.
- Cross-organization access is rejected.
- Invalid and traversal prefixes are rejected.
- The browser URL can be copied and reopened at the same folder.
- API, OpenAPI, SDK, UI, and tests are updated together.

