# Artifacts — projects, builds, uploads

Use this when an external app (Opsiva, CI, release pipeline) should store build outputs in VaultStack — analogous to uploading to S3, but with project/build metadata.

## Connectivity

```text
Project  →  Build  →  Artifact  →  ArtifactVersion  →  StorageObject
                                                         │
                                                         ▼
                                              bucket: vs-artifacts
                                              provider: org default (usually local)
```

- First upload **auto-creates** `vs-artifacts` on the default provider.
- Object key is server-generated: `ci/{projectId}/{buildId}/{artifactId}/{versionId}/{fileName}`.
- You do **not** pick a provider in the Create build / Upload dialogs.

Permissions: `artifact.read`, `artifact.upload`, `artifact.delete`.

## Routes

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/artifacts/projects` | `artifact.read` |
| `POST` | `/api/v1/artifacts/projects` | `artifact.upload` |
| `GET` | `/api/v1/artifacts/projects/:projectId` | `artifact.read` |
| `PATCH` | `/api/v1/artifacts/projects/:projectId` | `artifact.upload` |
| `DELETE` | `/api/v1/artifacts/projects/:projectId` | `artifact.delete` |
| `GET` | `/api/v1/artifacts/projects/:projectId/builds` | `artifact.read` |
| `POST` | `/api/v1/artifacts/projects/:projectId/builds` | `artifact.upload` |
| `GET` | `/api/v1/artifacts/projects/:projectId/builds/:buildId` | `artifact.read` |
| `PATCH` | `/api/v1/artifacts/projects/:projectId/builds/:buildId` | `artifact.upload` |
| `DELETE` | `/api/v1/artifacts/projects/:projectId/builds/:buildId` | `artifact.delete` |
| `GET` | `/api/v1/artifacts/projects/:projectId/builds/:buildId/artifacts` | `artifact.read` |
| `POST` | `/api/v1/artifacts/projects/:projectId/builds/:buildId/artifacts` | `artifact.upload` (initiate) |
| `GET` | `/api/v1/artifacts/projects/:projectId/artifacts` | `artifact.read` |
| `GET` | `/api/v1/artifacts/projects/:projectId/releases` | `artifact.read` |
| `GET` | `/api/v1/artifacts/:artifactId` | `artifact.read` |
| `DELETE` | `/api/v1/artifacts/:artifactId` | `artifact.delete` |
| `GET` | `/api/v1/artifacts/:artifactId/versions` | `artifact.read` |
| `GET` | `/api/v1/artifacts/versions/:versionId` | `artifact.read` |
| `POST` | `/api/v1/artifacts/versions/:versionId/complete` | `artifact.upload` |
| `POST` | `/api/v1/artifacts/versions/:versionId/download-url` | `artifact.read` |
| `POST` | `/api/v1/artifacts/versions/:versionId/release` | `artifact.upload` |
| `DELETE` | `/api/v1/artifacts/versions/:versionId` | `artifact.delete` |

## Create build body (all optional)

```json
{ "title": "opsiva_upload", "gitRef": "main", "commitSha": "abc…" }
```

Dashboard: leave Git ref / Commit SHA empty if you only care about uploading a file.

## Initiate artifact upload body

```json
{
  "name": "app.zip",
  "kind": "ARCHIVE",
  "fileName": "app.zip",
  "contentType": "application/zip",
  "size": 12345
}
```

`name` is required. `kind`: `GENERIC` | `PACKAGE` | `LOG` | `ARCHIVE` | `RELEASE` | `BUNDLE`.

## Initiate response (201)

```json
{
  "artifact": { "id": "…", "name": "app.zip", "kind": "ARCHIVE" },
  "version": { "id": "…", "status": "PENDING" },
  "upload": { "id": "…", "bucketId": "…", "key": "ci/…" },
  "uploadUrl": "http://…/api/v1/storage/uploads/…/content?token=…",
  "method": "PUT",
  "expiresAt": "…",
  "headers": { "content-type": "application/zip" }
}
```

## End-to-end from your project

```bash
export VS_API=http://localhost:5000
export VS_KEY=vs_ak_...
export PROJECT=<projectId>
export BUILD=<buildId>

# 1) Initiate
INIT=$(curl -sS -X POST \
  "$VS_API/api/v1/artifacts/projects/$PROJECT/builds/$BUILD/artifacts" \
  -H "Authorization: Bearer $VS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"app.zip","fileName":"app.zip","contentType":"application/zip","size":12345}')

UPLOAD_URL=$(echo "$INIT" | jq -r .uploadUrl)
VERSION=$(echo "$INIT" | jq -r .version.id)

# 2) PUT bytes (no Bearer)
curl -sS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/zip" \
  --data-binary @app.zip

# 3) Complete
curl -sS -X POST "$VS_API/api/v1/artifacts/versions/$VERSION/complete" \
  -H "Authorization: Bearer $VS_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# 4) Download URL
curl -sS -X POST "$VS_API/api/v1/artifacts/versions/$VERSION/download-url" \
  -H "Authorization: Bearer $VS_KEY"
```

## Dashboard path (what you already did)

1. **Artifacts** → create project (Opsiva).
2. **New build** → title optional; Git fields optional → Create.
3. Select build → **Upload artifact** (UI uses the same initiate/PUT/complete APIs).

To automate from Opsiva’s backend, use an **API key** + the curl/fetch flow above — not the S3 gateway (gateway has no project/build metadata).

## Test

- Shell: [examples/03-artifact-upload.sh](./examples/03-artifact-upload.sh)
- Integration: `apps/api/src/integration/phase10.artifacts.integration.test.ts`
- Model notes: [../artifacts/README.md](../artifacts/README.md)
