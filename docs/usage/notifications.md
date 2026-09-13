# Notifications and realtime delivery

VaultStack sends transactional email through **Resend** when `RESEND_API_KEY` is set
(or when `EMAIL_ENABLED=true` with a valid key). Templates reuse the dashboard visual
language: VaultStack shield logo, `#2563eb` / `#38bdf8` accents, Plus Jakarta Sans +
Source Sans 3 typography, and slate neutrals from `apps/dashboard/src/index.css`.

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `RESEND_API_KEY` | Resend API key (server-side only) |
| `EMAIL_FROM` | Verified sender, e.g. `VaultStack <notifications@yourdomain.com>` |
| `EMAIL_ENABLED` | Optional override; defaults to `true` when a key is present |
| `DASHBOARD_PUBLIC_URL` | Link target in emails; defaults to first `CORS_ORIGINS` entry |
| `REALTIME_ENABLED` | SSE hub (default `true`) |
| `REALTIME_MAX_CONNECTIONS_PER_USER` | Concurrent SSE cap per user (default `3`) |
| `REALTIME_HEARTBEAT_SECONDS` | Hub ping interval (default `30`) |

Delivery is asynchronous via the BullMQ `email-delivery` queue. The cleanup worker process
(`pnpm --filter @vaultstack/api worker:cleanup`) also runs the email worker.

## Implemented email triggers

| Event | Template | Service |
| ----- | -------- | ------- |
| Organization registration | Welcome | `AuthService.register` |
| Successful login / new device | Login detected | `AuthService.issueLoginSession` |
| Failed login (known user) | Login failed | `AuthService.recordLoginFailure` |
| Logout | Session revoked (self) | `AuthService.logout` |
| Revoke one session | Session revoked | `AuthService.revokeSession` |
| Revoke other sessions | Session revoked (others) | `AuthService.revokeOtherSessions` |
| 2FA enabled | Two-factor enabled | `AuthService.enableTotp` |
| 2FA disabled | Two-factor disabled | `AuthService.disableTotp` |
| User invited to organization | User invited | `UsersService.create` |
| Added to team | Team added | `TeamsService.addMember` |
| Account disabled | Account disabled | `UsersService.update` |
| Folder job completed | Folder operation completed | `FolderOperationService.process` |
| Folder job failed | Folder operation failed | `FolderOperationService.process` |
| Backup completed | Backup job completed | `BackupEngine.runJob` |
| Backup failed | Backup job failed | `BackupEngine.runJob` |

Each security email includes IP, browser/OS, approximate location (when geo lookup succeeds),
and a timestamp. Templates live in `@vaultstack/email` and match dashboard branding (VaultStack
shield logo, `#2563eb` / `#38bdf8` accents).

`securityAlertEmail()` is available for generic security headlines; wire new triggers through
`NotificationService.notifySecurityAlert()`.

## Recommended future email triggers

| Area | Trigger | Why |
| ---- | ------- | --- |
| Access | Role changed (especially to admin) | Privilege escalation awareness |
| Access | API key created / revoked | Service account security |
| Storage | External share created on user's object | Data exposure awareness |
| Storage | Folder access granted (user or team) | Collaboration invite |
| Backups | Restore completed | Confirmation of destructive action |
| Infrastructure | Disk threshold alert | Capacity planning |
| Audit | Configurable alert rules (failed logins N× in 15m) | SOC-style detection |

Prefer the same `NotificationService.queue()` path so retries, logging, and provider
swapping stay centralized.

## Realtime SSE (implemented)

Authenticated dashboard clients open a **Server-Sent Events** stream at
`GET /api/v1/realtime/events`.

### Security model

- **Session cookie auth only** — API keys cannot open SSE streams.
- **Organization scope** — events are filtered by the active organization cookie/header.
- **User scope** — Redis pub/sub channels are keyed by `userId`; the hub never forwards
  events across users.
- **Connection cap** — `REALTIME_MAX_CONNECTIONS_PER_USER` (default 3).
- **Rate-limit exemption** — SSE is excluded from per-IP REST rate limits; connection cap
  replaces burst protection for this route.
- **No secrets in payloads** — job IDs, status, and progress only.

The dashboard uses `fetch()` with `credentials: 'include'` and the organization header so
cross-origin dev (`localhost:5173` → `localhost:3000`) works with the same cookie/CSRF
model as the API client.

### Live event types

| Event | Source |
| ----- | ------ |
| `session.revoked` | Logout, revoke session, revoke others |
| `session.revoked_all` | Account disabled |
| `folder_operation.progress/completed/failed` | Folder operation worker |
| `backup_job.progress/completed/failed` | Backup engine |
| `ping` | Hub heartbeat (`REALTIME_HEARTBEAT_SECONDS`) |

Workers publish through Redis; the API hub forwards to open SSE connections.

## Dashboard integration

The dashboard connects automatically when signed in:

- `RealtimeBridge` — opens the SSE stream and handles `session.revoked` /
  `session.revoked_all` (instant logout on remote revoke).
- `useRealtimeSubscription` — job pages subscribe to folder-operation and backup events.
- Fallback polling (15s) remains as a resilience net when SSE is unavailable.

`GET /auth/me` returns `currentSessionId` so the client can match session-revoke events.

## gRPC vs WebSocket (future)

SSE is implemented for server → client events. Consider **WebSocket** only when the
dashboard needs client → server messages on the same socket (chat, collaborative cursors,
upload control). Reserve **gRPC** for internal worker/service boundaries, not browser traffic.

| Concern | SSE (current) | WebSocket (future) | gRPC |
| ------- | ------------- | ------------------ | ---- |
| Job progress + session revoke | Implemented | Optional upgrade | Not for UI |
| Browser auth | Cookie session + org header | Same + upgrade handshake | grpc-web proxy |
| Bidirectional UI | Poll or REST for writes | Native | Overkill |
| Worker coordination | Redis pub/sub today | Same | Strong candidate later |

Production rollout checklist: [`docs/deployment/thanos-pending.md`](../deployment/thanos-pending.md)
sections **13** (email) and **14** (realtime).
