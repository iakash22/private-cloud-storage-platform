# Storage UX specification

## Status

Proposed product and implementation plan for the bucket-first storage
experience.

This specification complements
[`storage-folders-roadmap.md`](./storage-folders-roadmap.md). The roadmap
defines storage behavior and API capabilities; this document defines how those
capabilities should be presented in the dashboard.

## Product direction

Storage should open with the organization’s buckets, not with an object
explorer. A user should first choose a bucket, then browse its prefixes and
objects.

The primary mental model is:

```text
Storage
└── All buckets
    └── Bucket
        └── Folder prefix
            └── Objects
```

This matches the useful parts of the AWS S3 and Cloudflare R2 workflows while
remaining provider-neutral:

- A bucket is the top-level storage namespace.
- A folder is a visual prefix, not a PostgreSQL hierarchy.
- An upload always targets the currently open bucket and prefix.
- Provider credentials and provider administration stay outside the object
  browser.

## Backend and API impact

This UX specification does not require replacing the storage backend or
changing the storage-provider abstraction. The existing storage API already
supports the core bucket-first flow:

- `GET /api/v1/storage/buckets`
- `GET /api/v1/storage/buckets/:bucketId`
- `GET /api/v1/storage/buckets/:bucketId/summary`
- `GET /api/v1/storage/buckets/:bucketId/objects?prefix=...&delimiter=/`
- `POST /api/v1/storage/buckets/:bucketId/folders`
- Upload initiation, completion, abort, and multipart upload endpoints
- Folder operation endpoints for copy, move, rename, and delete
- Provider listing and connection-test endpoints
- Bucket versioning, lifecycle policy, sharing, preview, and object-version
  endpoints

The dashboard must use these existing organization-scoped endpoints wherever
they provide the required behavior. Do not add a second storage API, expose
provider credentials, or implement authorization only in the frontend.

### Required API behavior

The server remains authoritative for every storage operation. It must:

- Resolve every bucket by both `organizationId` and `bucketId`.
- Validate all request bodies, query strings, and route parameters with Zod.
- Enforce RBAC permissions server-side for read, upload, delete, share, and
  provider actions.
- Treat folders as prefixes, not PostgreSQL directory records.
- Normalize and validate object keys, including trailing-slash folder markers.
- Reject path traversal, invalid keys, unauthorized prefixes, and invalid
  bucket destinations.
- Preserve the requested prefix when initiating and completing an upload.
- Write audit logs for bucket, folder, upload, move, copy, delete, share, and
  provider changes.
- Return structured field errors for invalid form fields and safe general
  errors for toast notifications.
- Never return secret keys, provider ciphertext, local filesystem paths, or
  other provider secrets to the browser.

### Recommended API enhancements

These enhancements are useful for the complete bucket control-center UX, but
are not blockers for the initial bucket browser:

1. Add a batch bucket-summary response, either through
   `GET /api/v1/storage/buckets?include=summary` or a dedicated summary
   endpoint. It should provide object count, total bytes, folder count,
   active shares, active operations, policy count, and safe provider health.
   The implementation must avoid one summary request per bucket.
2. Include the resolved `bucketId`, `prefix`, `delimiter`, and truncation state
   in object-list responses. This makes URL/state synchronization explicit and
   protects the frontend from displaying results for the wrong prefix.
3. Provide bucket-scoped activity data for the overview page, reusing audit
   records where possible rather than creating a second activity log.
4. Expose cached or explicitly requested provider health. Do not test every
   provider during every bucket-list request.

If any recommended enhancement changes a request or response shape, update
`packages/openapi/spec/openapi.yaml`, `docs/api/README.md`, affected API
client types, and tests in the same change.

### Frontend-only responsibilities

The dashboard owns presentation and navigation state:

- `/storage/buckets` is the landing route.
- `/storage/buckets/:bucketId` is the bucket overview.
- `?prefix=...` identifies the open virtual folder.
- Upload queue items capture their destination prefix at creation time.
- Successful uploads refresh the same bucket and prefix.
- Browser back and forward restore the bucket and prefix.
- Toasts and field errors follow the shared dashboard error policy.

The frontend must not infer authorization from hidden controls, construct
provider URLs, or treat a folder as a physical directory.

### Agent implementation rule

When implementing this specification, first reuse the existing storage
controllers, services, validation schemas, API client methods, and provider
interfaces. Before adding an endpoint, verify that the existing routes cannot
support the required screen. Any new route or response field requires:

1. A class-based controller/service implementation wired through `AppContainer`.
2. Zod validation in `@vaultstack/validation`.
3. Organization scoping, RBAC authorization, and audit logging.
4. API client and shared type updates.
5. OpenAPI, API documentation, and unit/API/dashboard tests.

Do not solve a UI state problem by weakening server validation or by adding
untyped request handling.

## Storage navigation

The storage navigation should contain:

- **All buckets** — the default storage landing page.
- **Files** — optional shortcut to the last-opened bucket and prefix.
- **Providers** — provider connections and health.
- **Shares** — organization and object shares.
- **Policies** — lifecycle and retention policy management.
- **Usage** — cross-bucket usage.
- **Trash** — recently deleted objects where recovery is supported.

The Storage navigation item should land on `/storage/buckets`.

The existing `/storage/files?bucket=<id>` route should remain supported as a
compatibility route, but new links should use:

```text
/storage/buckets
/storage/buckets/:bucketId
/storage/buckets/:bucketId?prefix=documents/2026/
```

## Screen 1: All buckets

### Header

The page header contains:

- Title: **Storage**
- Description: “Manage organization buckets, providers, and objects.”
- Organization context
- **Create bucket** primary action
- Refresh action

### Bucket summary

Show compact metrics above the list:

- Total buckets
- Total objects
- Total storage
- Provider health summary

Metrics should be skeleton-loaded and should not block the bucket list from
rendering.

### Bucket list

Use a responsive table on desktop and cards on small screens. Each bucket row
should show:

- Bucket name and bucket icon
- Provider name and provider type
- Region or endpoint label when safe to expose
- Versioning state
- Object count
- Approximate size
- Last activity
- Health indicator
- **Open** action
- More actions menu

The row itself should also be clickable. The selected row must have a visible
focus and selected state.

### Bucket list controls

Provide:

- Search by bucket name
- Sort by name, usage, object count, or last activity
- Provider filter
- Health filter
- Versioning filter

Do not show object-level filters on this page.

### Empty state

When there are no buckets:

```text
No buckets yet
Create a bucket to start storing objects.
[Create bucket]
```

If the user lacks `storage.upload`, replace the action with a permission
message rather than displaying a disabled button without context.

## Screen 2: Bucket overview

Opening a bucket should first show a small bucket control center, with a clear
**Browse files** action.

The overview should contain:

- Bucket name and breadcrumb back to **All buckets**
- Provider badge
- Provider health
- Versioning state
- Usage and object count
- Active lifecycle policies
- Active shares
- Recent activity
- Running folder or upload jobs
- **Browse files** primary action
- **Bucket settings** secondary action

The overview must not expose provider secret keys, access keys, or connection
credentials.

Recommended bucket tabs:

```text
Overview | Files | Usage | Policies | Shares | Activity | Settings
```

Tabs should remain scoped to the selected bucket. If a feature is not
available for a provider, show an explanation and a safe setup link.

## Screen 3: Bucket file browser

### Header

The file browser header contains:

- Breadcrumb:
  `All buckets / my-bucket / documents / 2026`
- Bucket name
- Current prefix
- Provider badge
- Refresh action
- **Upload** primary action
- **New folder** secondary action
- More actions menu

The current prefix must be visible in the upload action. For example:

```text
Upload to documents/2026/
```

### Breadcrumb behavior

Each breadcrumb segment is clickable. Clicking a segment:

1. Updates the current prefix.
2. Updates the URL.
3. Cancels no active upload.
4. Refreshes only the new listing.
5. Clears the selected object.

Browser back and forward must restore both bucket and prefix.

### Listing behavior

The default listing order is:

1. Folders
2. Files

Within each group, use the selected sort field. The default sort is name
ascending.

Each folder row shows:

- Folder icon
- Folder name
- Optional item count when available
- Last activity when available
- More actions

Each file row shows:

- File icon or type icon
- File name
- Size
- Modified date
- Version indicator
- Share indicator
- Processing indicator
- More actions

Empty folder markers must never appear as ordinary files.

### Filters

Advanced filters should be hidden by default behind a **Filters** button.

The filter drawer can contain:

- Content type
- Size range
- Modified date range
- Sharing state
- Version state
- Processing state
- Folder prefix
- Tag

When filters are active, show filter chips and a **Clear all** action. Filters
must not change the current bucket or prefix.

## Upload experience

### Destination-first upload

The upload surface must always show the destination before files are selected:

```text
Upload to
my-bucket / documents / invoices
```

The selected destination is captured when the upload starts. Navigating to
another folder afterward must not change the destination of an existing upload.

### Object key rules

The browser must construct the object key as:

```text
objectKey = currentPrefix + fileName
```

Examples:

```text
root + report.pdf                    => report.pdf
documents/ + report.pdf              => documents/report.pdf
documents/invoices/ + report.pdf     => documents/invoices/report.pdf
```

The prefix must be normalized to exactly one trailing slash. File names must
not be allowed to escape the prefix.

### Upload dialog

The upload dialog should support:

- Drag and drop files
- File picker
- Folder picker where supported
- Per-file destination key preview
- Duplicate-name handling
- Cancel before upload
- Retry failed files
- Pause/resume for multipart uploads
- Close/minimize while uploads continue

For folder selection, preserve relative paths:

```text
selected-folder/a.txt
selected-folder/nested/b.txt
```

Those paths are appended to the current prefix.

### Completion behavior

After upload completion:

- Keep the user in the same bucket and prefix.
- Refresh the current listing.
- Show a success toast with the count of uploaded files.
- Do not redirect to the bucket root.
- Do not show completed uploads as errors.

If only some files fail, show a partial-success result with retry actions for
the failed files.

## Folder creation

The **New folder** dialog should show its destination:

```text
Create folder inside
my-bucket / documents / 2026
```

Validation:

- Required name
- Trim surrounding whitespace
- Reject `/`
- Reject `.` and `..`
- Reject empty segments
- Enforce server key length limits
- Reject names that collide with an existing live object or folder marker

After creation:

- Keep the current prefix open.
- Refresh the current listing.
- Focus the new folder when possible.
- Show a success toast.

The server remains authoritative for normalization and authorization.

## Folder and object actions

### Folder actions

Recommended folder actions:

- Open
- Rename
- Move
- Copy
- Delete
- Create share, when authorized

Rename, move, copy, and delete are prefix operations and must use the durable
folder-operation job flow. The UI should show:

- Queued
- Running
- Paused
- Completed
- Failed
- Cancelled

### Object actions

Recommended object actions:

- Open details
- Preview
- Download
- Rename
- Move
- Copy
- Share
- Manage versions
- Edit metadata
- Delete

Destructive actions require confirmation and must communicate whether they are
recoverable.

## Create bucket flow

The create bucket dialog should be a short, guided flow:

### Step 1: Identity

- Bucket name
- Naming rules shown inline
- Availability/conflict validation

### Step 2: Provider

- Local filesystem
- S3-compatible provider
- Cloudflare R2-compatible provider

Show provider health and a safe provider summary. Never display secret
credentials after submission.

### Step 3: Options

- Versioning
- Default lifecycle policy, if supported
- Optional tags or description

### Step 4: Review

Show:

- Bucket name
- Provider
- Region/endpoint summary
- Versioning
- Policy summary

After creation, navigate to the new bucket overview, not directly to an
unexplained empty file list.

## Provider flow

Providers are configured independently from buckets.

Provider list states:

- Connected and healthy
- Connected with warning
- Unreachable
- Credentials incomplete
- Not tested

Provider actions:

- Add provider
- Test connection
- Edit configuration
- Set as default
- View affected buckets
- Remove provider

Removing a provider must show affected buckets and block removal when it would
orphan active bucket configuration unless an explicit migration flow exists.

## AWS S3 and Cloudflare R2 compatibility

VaultStack should follow the shared behavior of AWS S3 and Cloudflare R2:

- Both use flat object namespaces.
- `/` is a delimiter for visual prefixes.
- Folder views are derived from common prefixes.
- Empty folders may use a trailing-slash zero-byte marker.
- Uploading to a folder means adding the folder prefix to the object key.
- Folder browsing should use delimiter-aware listing.
- Normal listings should hide marker objects.

VaultStack should not claim that folders are physical directories. UI copy
should say “folder” for users and “prefix” in technical details/tooltips.

## Loading, error, and permission states

### Loading

- Use skeleton rows for bucket and object lists.
- Keep the header and breadcrumb visible during refresh.
- Avoid replacing the entire screen with a spinner after an upload.

### Errors

- Field validation errors appear beside their fields.
- API field errors appear beside matching fields only.
- Other 4xx errors appear as one toast.
- 5xx errors appear as `Internal server error`.
- Network errors appear as `Unable to connect to the API`.
- Duplicate identical toasts should be suppressed.

### Permission states

The UI should hide or disable actions based on permissions, but the API remains
authoritative. Explain missing permissions in tooltips or empty states:

```text
You can view this bucket, but you do not have permission to upload objects.
```

## Accessibility requirements

- Use real buttons and links for all actions.
- Every icon-only action has an accessible label.
- Keyboard users can open folders and dialogs.
- Focus moves into dialogs and returns to the triggering control.
- Upload progress is announced with `aria-live`.
- Error toasts use an alert role.
- Success notifications use a status role.
- Color is never the only indicator of health or error state.
- Breadcrumbs expose the current location to screen readers.

## Responsive behavior

### Desktop

- Bucket table with summary columns.
- File table with details and actions.
- Persistent bucket header and breadcrumb.

### Tablet

- Hide lower-priority columns.
- Keep provider, name, size, and primary action visible.
- Move filters into a drawer.

### Mobile

- Bucket cards instead of a table.
- File cards with a compact overflow menu.
- Sticky bottom upload action where appropriate.
- Breadcrumb collapses to a back button plus current folder name.
- Upload destination remains visible above the queue.

## Implementation sequence

### Phase A: bucket-first navigation

- Add `/storage/buckets` as the Storage landing route.
- Improve bucket list and empty state.
- Add bucket overview entry point.
- Keep the existing files route as a compatibility route.

### Phase B: bucket browser

- Add bucket-scoped route and header.
- Move breadcrumb and prefix state into the bucket browser.
- Preserve browser history.
- Keep filters behind a drawer.

### Phase C: reliable uploads

- Capture the upload destination prefix when a queue item is created.
- Display the complete destination key.
- Refresh the same prefix after completion.
- Add tests for root, nested, empty-folder, and folder-picker uploads.

### Phase D: folder operations

- Add destination-aware create-folder dialog.
- Add durable progress UI for move, copy, rename, and delete.
- Add partial failure and retry states.

### Phase E: bucket control center

- Add usage, provider health, policies, shares, activity, and settings tabs.
- Link all tabs to the selected bucket.
- Add provider impact warnings.

## Acceptance criteria

- Storage opens on the bucket list.
- Clicking a bucket opens its overview.
- Browse files opens the bucket root.
- Clicking a folder updates the breadcrumb and URL.
- Empty folders can be opened.
- Uploading `report.pdf` inside `documents/invoices/` creates the key
  `documents/invoices/report.pdf`.
- Upload completion keeps the current folder open.
- Browser back and forward preserve bucket and prefix.
- Folder markers are hidden from ordinary file rows.
- AWS S3 and Cloudflare R2-style prefix behavior is preserved.
- Field errors and toast errors follow the shared dashboard error policy.
- No provider secret is exposed in the dashboard.
- Unit, API, and dashboard tests cover the bucket, prefix, and upload flows.

