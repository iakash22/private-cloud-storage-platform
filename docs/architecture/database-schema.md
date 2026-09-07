# Database schema

PostgreSQL holds **metadata only**. Object bytes live in a `StorageProvider` (local filesystem or S3-compatible backend), never in the database.

Source of truth: [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma).

## Entity-relationship diagram

The diagram below shows every Prisma model and foreign-key relationship. `StorageObject.currentVersionId` is intentionally **not** a foreign key (see schema comment) — the dashed line marks a logical pointer only.

```mermaid
erDiagram
    User ||--o{ Session : "has"
    User ||--o{ UserRole : "assigned"
    User ||--o{ ApiKey : "creates"
    User ||--o{ AuditLog : "performs"

    Organization ||--o{ Team : "owns"
    Organization ||--o{ Role : "defines"
    Organization ||--o{ UserRole : "scopes"
    Organization ||--o{ ApiKey : "owns"
    Organization ||--o{ AuditLog : "records"
    Organization ||--o{ StorageProvider : "configures"
    Organization ||--o{ Bucket : "owns"
    Organization ||--o{ StorageObject : "owns"
    Organization ||--o{ ObjectVersion : "owns"
    Organization ||--o{ Upload : "owns"
    Organization ||--o{ MultipartUpload : "owns"
    Organization ||--o{ StoragePolicy : "defines"
    Organization ||--o{ ShareLink : "issues"

    Role ||--o{ RolePermission : "grants"
    Permission ||--o{ RolePermission : "referenced_by"
    Role ||--o{ UserRole : "assigned_via"

    StorageProvider ||--o{ Bucket : "stores"
    StorageProvider ||--o{ StorageObject : "stores"
    StorageProvider ||--o{ ObjectVersion : "stores"
    StorageProvider ||--o{ MultipartUpload : "stores"

    Bucket ||--o{ StorageObject : "contains"
    Bucket ||--o{ ObjectVersion : "contains"
    Bucket ||--o{ Upload : "receives"
    Bucket ||--o{ MultipartUpload : "receives"
    Bucket ||--o{ StoragePolicy : "scoped_to"

    StorageObject ||--o{ ObjectVersion : "versioned_as"
    StorageObject ||--o{ ShareLink : "shared_via"
    StorageObject }o..o| ObjectVersion : "currentVersionId (logical)"

    MultipartUpload ||--o{ MultipartPart : "composed_of"

    User {
        string id PK
        string email UK
        string passwordHash
        string name
        datetime disabledAt
    }

    Session {
        string id PK
        string userId FK
        string tokenHash UK
        string csrfHash
        datetime expiresAt
    }

    Organization {
        string id PK
        string name
        string slug UK
    }

    Team {
        string id PK
        string organizationId FK
        string name
    }

    Role {
        string id PK
        string organizationId FK
        string name
        boolean isSystem
    }

    Permission {
        string id PK
        string key UK
        string description
    }

    RolePermission {
        string roleId FK
        string permissionId FK
    }

    UserRole {
        string id PK
        string userId FK
        string roleId FK
        string organizationId FK
    }

    ApiKey {
        string id PK
        string organizationId FK
        string userId FK
        string keyHash UK
        string prefix
    }

    AuditLog {
        string id PK
        string organizationId FK
        string userId FK
        string action
        string resourceType
    }

    StorageProvider {
        string id PK
        string organizationId FK
        enum type
        enum status
        boolean isDefault
        json config
    }

    Bucket {
        string id PK
        string organizationId FK
        string storageProviderId FK
        string name
        enum versioning
        string physicalPrefix
    }

    StorageObject {
        string id PK
        string organizationId FK
        string bucketId FK
        string storageProviderId FK
        string key
        bigint size
        string etag
        string currentVersionId
        string physicalKey
    }

    ObjectVersion {
        string id PK
        string objectId FK
        string bucketId FK
        string storageProviderId FK
        string versionId
        boolean isCurrent
        string physicalKey
    }

    Upload {
        string id PK
        string organizationId FK
        string bucketId FK
        enum status
        string tokenHash UK
        string stagingKey
    }

    MultipartUpload {
        string id PK
        string organizationId FK
        string bucketId FK
        string storageProviderId FK
        enum status
        string providerUploadId
    }

    MultipartPart {
        string id PK
        string multipartUploadId FK
        int partNumber
        bigint size
        string etag
    }

    StoragePolicy {
        string id PK
        string organizationId FK
        string bucketId FK
        enum effect
        string_array actions
    }

    ShareLink {
        string id PK
        string organizationId FK
        string objectId FK
        string tokenHash UK
        boolean allowDownload
    }
```

## Domain groups

| Domain | Models | Notes |
| --- | --- | --- |
| Identity | `User`, `Session` | Sessions store hashed tokens; plaintext never persisted |
| Tenancy | `Organization`, `Team` | Every org-owned row carries `organizationId` |
| RBAC | `Role`, `Permission`, `RolePermission`, `UserRole` | Permissions seeded from `@vaultstack/types` |
| Automation | `ApiKey` | Hashed keys; prefix shown to users |
| Audit | `AuditLog` | Append-only action log per organization |
| Storage control plane | `StorageProvider`, `Bucket`, `StoragePolicy` | Provider credentials stay in server env, not DB |
| Storage data plane | `StorageObject`, `ObjectVersion`, `Upload`, `MultipartUpload`, `MultipartPart` | Metadata only; bytes in provider |
| Sharing (future) | `ShareLink` | Foundation for Phase 8; no anonymous route yet |

## Cascade behavior

- Deleting an **Organization** cascades to all org-owned resources.
- Deleting a **User** cascades sessions, user roles, and API keys; audit logs keep the row with `userId` set null.
- Deleting a **StorageProvider** is restricted while buckets or objects reference it (`onDelete: Restrict`).
- **MultipartPart** rows cascade when their parent multipart upload is deleted.

## Keeping this diagram current

When you change `schema.prisma` (new models, fields, or relations), update this file in the same change. See [`AGENTS.md`](../../AGENTS.md) rule 21 and [`.cursor/rules/api-docs-sync.mdc`](../../.cursor/rules/api-docs-sync.mdc).
