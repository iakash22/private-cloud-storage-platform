# Security

Phase 1 authorization is server-side only.

## Authentication

- User access tokens are JWTs signed with `JWT_SECRET` (never sent to the browser as a secret).
- API keys are shown once at creation. Only a SHA-256 hash is stored.
- Passwords are hashed with bcrypt. Passwords, tokens, and key hashes are redacted from logs.

## Authorization

`can(user, permission, resource)` returns true only when the user has a role in `resource.organizationId` that includes the permission.

Cross-organization access is denied even if the same user has that permission in a different organization.

Destructive operations (team delete, API key revoke, role unassign) require the matching permission.

## Tenancy

Every organization-owned row has `organizationId`. Lookups always filter by that id from the route, never from an untrusted body field used as the sole authorization source.

## Audit

Register, organization/user/team/role/API-key changes, and role assignment write `AuditLog` rows.
