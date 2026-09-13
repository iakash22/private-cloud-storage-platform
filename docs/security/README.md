# Security

Phase 2 authentication is cookie-based. Authorization remains server-side.

## Authentication

Browser sessions use a random token stored only in an **HTTP-only**, `SameSite=Lax` cookie named `vs_session`. The raw token is hashed (SHA-256) in PostgreSQL. It is never returned in JSON and must not be stored in `localStorage`.

The dashboard is a separate origin (`:5173` vs `:3000`). The API reflects allowed `Origin` values with `Access-Control-Allow-Credentials: true`. Development defaults to `http://localhost:5173` and `http://127.0.0.1:5173`. Production sends no CORS headers unless `CORS_ORIGINS` is set. No `cors` package is used; the allowlist lives in `apps/api/src/middleware/cors.ts`.

A companion `vs_csrf` cookie (readable by JavaScript) plus the `x-csrf-token` header protect cookie-authenticated `POST`/`PATCH`/`PUT`/`DELETE` requests (double-submit CSRF). Bearer JWT and API keys skip CSRF because they are not sent automatically by the browser.

On login the previous session token, if any, is revoked and a new session is issued (session fixation protection). Logout revokes the session and clears both cookies. Expired or revoked sessions cannot call `/api/v1/auth/me`.

Passwords are hashed with bcrypt. New passwords must be 10–128 characters and include a letter and a number. Disabled users (`User.disabledAt`) cannot log in; their sessions are revoked when they are disabled.

Optional TOTP two-factor authentication (RFC 6238) can be enabled per user in Settings. The authenticator secret is stored as AES-256-GCM ciphertext derived from `JWT_SECRET`. Login with 2FA enabled issues a short-lived challenge JWT instead of a session; the session is created only after a valid authenticator or backup code. Backup codes are stored as SHA-256 hashes and each can be used once. Setup, enable, and disable are audited (`auth.2fa.setup`, `auth.2fa.enable`, `auth.2fa.disable`) without recording secrets or codes.

API keys remain available for automation. Only a SHA-256 hash is stored. Keys are shown once at creation.

Passwords, session tokens, CSRF tokens, cookies, and key hashes are redacted from logs.

## Rate limiting

Login is limited per IP + email and per IP (Redis in production, in-memory in tests) to slow brute-force attempts. `POST /api/v1/auth/login/totp` uses the same limiter. `/api/v1` also has a general per-IP limit. Limited responses use `429` with `RATE_LIMITED` and a `Retry-After` header.

`GET /api/v1/realtime/events` is **excluded** from the per-IP REST burst limiter; instead,
each user may hold at most `REALTIME_MAX_CONNECTIONS_PER_USER` concurrent SSE connections
(default 3). The stream requires a **session cookie** (API keys are rejected). Events are
filtered server-side by `userId` and active organization. Payloads never include secrets,
tokens, or storage credentials.

Failed login attempts for known accounts can trigger a security email when Resend is
configured. Session revoke and account disable push realtime events so other browsers
logout without waiting for the next REST call.

No extra npm packages were added for cookies, rate limiting, or CORS: hashing and cookie serialization live in `@vaultstack/auth`, the limiter is a small Redis/`Map` helper in the API, and browser origins are allowlisted in a small Express middleware. Transactional email uses the `resend` package in `@vaultstack/email` (server-side only).

## Authorization

`can(user, permission, resource)` returns true only when the user has a role in `resource.organizationId` that includes the permission.

Cross-organization access is denied even if the same user has that permission in a different organization.

System roles and their default permissions:

| Role          | Access                                   |
| ------------- | ---------------------------------------- |
| SUPER_ADMIN   | Every permission                         |
| ADMIN         | User management, audit, and read access  |
| STORAGE_ADMIN | Storage write/share plus artifact read   |
| BACKUP_ADMIN  | Backup create/restore/delete             |
| DEVELOPER     | Storage and artifact upload, backup read |
| VIEWER        | Read-only                                |

Privilege escalation is blocked in the service layer:

- Actors cannot grant permissions they do not have (SUPER_ADMIN excepted).
- Only SUPER_ADMIN can assign or remove SUPER_ADMIN.
- The last SUPER_ADMIN cannot be removed or disabled.
- Users cannot disable themselves.
- System role names are reserved.

Destructive operations require `users.manage` or `audit.read` as appropriate.

## Tenancy

Every organization-owned row has `organizationId`. Lookups always filter by that id from the route, never from an untrusted body field used as the sole authorization source.

## Audit

Register, login, logout, organization/user/team/role/API-key changes, role assignment, and user disable write `AuditLog` rows. Failed logins for known users are recorded with a failure result and reason; unknown identities are not persisted. Audit metadata is sanitized so passwords, credentials, authorization headers, presigned URLs, and file contents are never stored.
