# API documentation

All business APIs are served under `/api/v1`.

Infrastructure probes remain at `/health` and `/ready` (also mirrored at `/api/v1/health` and `/api/v1/ready`).

## Error envelope

Every error includes a request id:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action"
  },
  "requestId": "..."
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`.

Authenticated requests use `Authorization: Bearer <jwt>` or `Authorization: Bearer <api-key>`.

`organizationId` is taken from the route and checked server-side. Clients cannot grant themselves access to another organization by sending an organization id in the body.

## Endpoints

### Auth

- `POST /api/v1/auth/register` — create owner user + organization
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

### Organizations

- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/:organizationId`
- `PATCH /api/v1/organizations/:organizationId`

### Users

- `GET /api/v1/organizations/:organizationId/users`
- `POST /api/v1/organizations/:organizationId/users`
- `GET /api/v1/organizations/:organizationId/users/:userId`
- `PATCH /api/v1/organizations/:organizationId/users/:userId`

### Roles

- `GET /api/v1/organizations/:organizationId/roles`
- `POST /api/v1/organizations/:organizationId/roles`
- `GET /api/v1/organizations/:organizationId/roles/:roleId`
- `POST /api/v1/organizations/:organizationId/users/:userId/roles`
- `DELETE /api/v1/organizations/:organizationId/users/:userId/roles/:roleId`

### Teams

- `GET /api/v1/organizations/:organizationId/teams`
- `POST /api/v1/organizations/:organizationId/teams`
- `GET /api/v1/organizations/:organizationId/teams/:teamId`
- `PATCH /api/v1/organizations/:organizationId/teams/:teamId`
- `DELETE /api/v1/organizations/:organizationId/teams/:teamId`

### Permissions, API keys, audit

- `GET /api/v1/permissions`
- `GET /api/v1/organizations/:organizationId/api-keys`
- `POST /api/v1/organizations/:organizationId/api-keys`
- `DELETE /api/v1/organizations/:organizationId/api-keys/:apiKeyId`
- `GET /api/v1/organizations/:organizationId/audit-logs`

Storage objects and backups are not implemented in Phase 1.
