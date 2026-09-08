# Local filesystem provider

`LocalFilesystemStorageProvider` is VaultStack's **primary production storage
backend**. It is a first-class provider, not a fallback: it implements the whole
`StorageProvider` interface, and the system runs on it with no S3-compatible
service present.

## Configuration

One variable matters:

```bash
STORAGE_LOCAL_ROOT=/srv/vaultstack/data
```

The root is always configuration — no production path is compiled in.

| Environment                    | Suggested root                                     |
| ------------------------------ | -------------------------------------------------- |
| Windows host / WSL development | `./.vaultstack/storage` (gitignored)               |
| Containerized development      | `/data`, backed by the `vaultstack_storage` volume |
| Production                     | `/srv/vaultstack/data`, a real persistent mount    |

Object data must never live on a container's writable layer. In production the
root should be a mounted persistent volume or disk.

The provider creates its own layout on first use, so pointing it at an empty
directory is enough. Its health check reports `ok` after successfully creating
the layout and writing a probe file, and `degraded` when the root cannot be
created or written.

## Physical layout

```
$STORAGE_LOCAL_ROOT/
    objects/
        vs-<bucket-id>/
            <organization-id>/
                <ab>/                     two-character fan-out
                    <object-id>/
                        <version-id>/
                            data          the object bytes
                            metadata.json contentType, etag, md5, sha256, size
    multipart/
        <provider-upload-id>/
            upload.json                   recorded destination
            00001.part                    staged parts
            00001.part.md5
    temp/                                 staging for in-flight writes
    trash/                                reserved for deferred deletion
```

Every path component is server-generated:

- Bucket directory: derived from the bucket's database id, not its name.
- Fan-out directory: first two characters of the object id, which keeps
  directory sizes manageable on ext4 and xfs.
- Object and version directories: server-generated ids.

A user-supplied object key never appears in this tree. `bucket/key` is
deliberately _not_ mapped onto `filesystem/bucket/key`, because keys are
user-controlled.

Including the organization id in the path is for on-disk auditability only.
Isolation is enforced by organization-scoped database queries, not by directory
structure.

## Versioning

Each write lands under a fresh `<version-id>` directory, so previous bytes stay
intact and `ObjectVersion` rows can point at real data. The current version is
identified by `ObjectVersion.isCurrent`. Delete markers have no bytes. Version
listing, restore, and lifecycle expiration are handled by the storage service
and worker; this provider only stores opaque physical keys.

## Path safety

`safe-path.ts` is the containment layer, and it is defence in depth — physical
identifiers are already server-generated, so these checks exist to ensure that a
bug elsewhere still cannot escape the root.

`resolveWithinRoot(root, ...segments)` rejects a segment that:

- is empty
- contains a null byte
- is absolute (`path.resolve` would otherwise silently discard the root)
- starts with a drive letter, e.g. `C:\Windows`
- contains a `..` component

and then re-asserts that the resolved path is still inside the root, comparing
against `root + path.sep` so a sibling like `/srv/vaultstack-evil` cannot pass.

`assertRealPathWithinRoot(root, target)` closes the symlink escape that textual
checks cannot see. It resolves the deepest existing ancestor with `realpath` and
re-checks containment, which catches both a symlinked file pointing outside the
root and a symlinked _parent directory_ whose textual path still looks
contained.

Failures raise `STORAGE_ACCESS_DENIED` with no path in the message.

Object keys are separately validated before they are ever stored. Rejected:
empty keys, keys over `STORAGE_MAX_KEY_LENGTH` bytes (measured in bytes, so
multi-byte characters cannot exceed the limit), null bytes, control characters,
leading `/`, backslashes, drive letters, `//`, trailing `/`, and any `.` or `..`
segment.

## Streaming

Uploads stream request → `IntegrityMeter` → write stream → disk, with
backpressure, and nothing accumulates in memory. Downloads stream from disk to
the response and support `Range` requests, including open-ended and
past-the-end ranges (clamped) with `Content-Range` set.

The size ceiling is enforced _during_ the stream: the meter fails as soon as the
limit is exceeded rather than after the whole body has arrived, so an oversized
upload does not consume disk or memory proportional to its claimed size.

## Durability and cleanup

Writes stage into `temp/` and are then `rename`d into place. Within a volume
that rename is atomic, so a concurrent reader sees either the complete previous
object or the complete new one — never a torn mixture.

On any failure — oversized body, checksum mismatch, client disconnect, aborted
signal — the staged file is removed. The provider also exposes
`cleanupStaleStaging(olderThan)` to reclaim abandoned temp files and multipart
parts, so partial data is not kept indefinitely.

Because all state lives on disk rather than in memory, restarting the API does
not affect stored objects.

## Presigned URLs

The local provider reports `nativePresignedUrls: false` and refuses to mint
provider-native URLs, because it has no credential of its own to sign with.

Instead the storage service issues a VaultStack-signed URL: a short-lived
HMAC-SHA256 token scoped to a single object or upload, carrying the
organization, verified server-side on every use. This mirrors S3 presigning
semantics — a shareable, expiring, single-object URL that needs no session —
without exposing any storage credential. Token signatures are compared in
constant time, and a token issued for one object is rejected if replayed against
another.

## Multipart uploads

Parts stage under `multipart/<provider-upload-id>/` alongside their MD5, and the
destination is recorded in `upload.json` at initiation so completion cannot be
redirected by a client.

Completion streams each part in order into a single output, one chunk at a time,
so peak memory stays constant regardless of assembled size. Parts may arrive out
of order and are assembled by part number. Completion referencing a part that
was never uploaded fails. On completion or abort the staging directory is
removed.

The resulting ETag is the multipart form (`<md5-of-digests>-<partCount>`), not a
whole-object MD5.

## Testing

`local-filesystem.provider.test.ts` covers bucket lifecycle, put/get/head/
delete, copy, prefix and delimiter listing, pagination, multipart, presigned
refusal, path containment, and health. It asserts real bytes on disk, survival
across a provider restart, concurrent writes to distinct and to identical
objects, constant memory for a 32 MiB object, and empty staging after every
failure path.

`safe-path.test.ts` covers containment, traversal, absolute and Windows paths,
null bytes, and real symlink escapes using actual symlinks on disk.

Run them with:

```bash
pnpm --filter @vaultstack/api test
```

No Docker is required for any of it — which is the point.
