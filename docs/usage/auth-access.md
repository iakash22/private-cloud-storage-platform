# Auth and access

How clients authenticate and get organization context before calling storage or artifact routes.

## Auth modes

| Mode | How | CSRF | Org context |
| --- | --- | --- | --- |
| Session (dashboard) | `vs_session` cookie after login | Required: `x-csrf-token` on mutations | `vs_org` cookie or `x-vaultstack-organization` |
| API key (apps/CI) | `Authorization: Bearer vs_ak_…` | Not required | Pinned to the key’s organization |
| S3 credential | AWS SigV4 on `/api/v1/s3` | N/A | Pinned to the credential’s organization |

## Routes — authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Public | First SUPER_ADMIN + org + session |
| `POST` | `/api/v1/auth/login` | Public | Session cookies, or TOTP challenge |
| `POST` | `/api/v1/auth/login/totp` | Public | Finish 2FA login |
| `POST` | `/api/v1/auth/logout` | Session | Revoke session |
| `GET` | `/api/v1/auth/me` | Session/key | Current user + CSRF token + permissions |
| `POST` | `/api/v1/auth/organization` | Session | Set active org selector |
| `POST` | `/api/v1/auth/2fa/setup` | Session | Begin TOTP enrollment |
| `POST` | `/api/v1/auth/2fa/enable` | Session | Confirm 2FA; backup codes once |
| `POST` | `/api/v1/auth/2fa/disable` | Session | Turn off 2FA |

## Routes — organizations / users / roles / teams

| Method | Path | Permission |
| --- | --- | --- |
| `GET/POST` | `/api/v1/organizations` | membership / create |
| `GET/PATCH` | `/api/v1/organizations/:organizationId` | `users.read` / `users.manage` |
| `GET/POST` | `/api/v1/organizations/:organizationId/users` | `users.read` / `users.manage` |
| `GET/PATCH` | `/api/v1/organizations/:organizationId/users/:userId` | `users.read` / `users.manage` |
| `GET/POST` | `/api/v1/organizations/:organizationId/roles` | `users.read` / `users.manage` |
| `POST/DELETE` | `/api/v1/organizations/:organizationId/users/:userId/roles[/:roleId]` | `users.manage` |
| `GET/POST/PATCH/DELETE` | `/api/v1/organizations/:organizationId/teams…` | `users.read` / `users.manage` |
| `GET` | `/api/v1/permissions` | authenticated |

## Routes — API keys (REST automation)

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/organizations/:organizationId/api-keys` | `users.manage` |
| `POST` | `/api/v1/organizations/:organizationId/api-keys` | `users.manage` |
| `DELETE` | `/api/v1/organizations/:organizationId/api-keys/:apiKeyId` | `users.manage` |

Create body: `{ "name": "opsiva-ci" }` optional `expiresAt`.  
Response includes `token` **once** (`vs_ak_` + hex). Permissions inherit the **creating user’s** roles in that org.

## Routes — S3 service-account credentials

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/organizations/:organizationId/s3-credentials` | Create (`VSKA…` + secret once) |
| `GET` | `/api/v1/organizations/:organizationId/s3-credentials` | List metadata |
| `PATCH` | `/api/v1/organizations/:organizationId/s3-credentials/:credentialId` | Permissions / buckets / expiry |
| `POST` | `…/revoke` / `…/rotate` | Revoke or rotate secret |
| `GET/PATCH` | `…/s3-credentials/service-accounts[/:id]` | List / enable / disable |

Required create fields: `serviceAccountName`, `permissions` (≥1). Optional: `allowedBucketNames`, `expiresAt`, `description`.

## Routes — audit

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/organizations/:organizationId/audit-logs` | `audit.read` |

## How to use from your project

```bash
# After creating an API key in the dashboard:
export VS_API=http://localhost:5000
export VS_KEY=vs_ak_...

curl -sS "$VS_API/api/v1/auth/me" \
  -H "Authorization: Bearer $VS_KEY"
```

Dashboard UI: **Access → API keys** (and service accounts for S3 gateway).

## Test

- Manual: [examples/01-auth-api-key.sh](./examples/01-auth-api-key.sh)
- Automated: auth/session coverage in `apps/api` integration tests; see [../development/testing.md](../development/testing.md)

## Related

- [../security/README.md](../security/README.md)
- [../api/README.md](../api/README.md)
