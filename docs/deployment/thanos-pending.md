# THANOS — pending operator checklist

Living list of work that is **still incomplete on the THANOS host** relative to
`[thanos.md](./thanos.md)`. Mark items done on the server as you finish them;
keep this file updated when new gaps appear.

Last reviewed against deploy conversation state: **2026-09-14**.

---

## Status legend

| Mark  | Meaning                   |
| ----- | ------------------------- |
| `[ ]` | Not done on THANOS yet    |
| `[x]` | Done / verified on THANOS |
| `!—`  | Blocked; see note         |

---

## P0 — unblock product use

### 1. Confirm stack is running

```bash
sudo systemctl status vaultstack --no-pager
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

- [ ] `vaultstack.service` is **active**
- [ ] Containers present: `api`, `dashboard`, `postgres`, `redis`, workers, `s3-gateway`
- [ ] Note real Postgres name (often `vaultstack-postgres-1`, **not** `vaultstack-postgres`)

If nothing is running:

```bash
cd /srv/vaultstack/compose
sudo docker compose --env-file /srv/vaultstack/config/compose.env \
  -f docker-compose.yml -f docker-compose.ivaultstack.yml ps
sudo systemctl start vaultstack
```

### 2. Repair empty role permissions (nav only shows Dashboard + Settings)

Previous attempt failed with `No such container: vaultstack-postgres`.

```bash
cd /srv/src/private-cloud-storage-platform
git fetch origin && git reset --hard origin/main   # as user thanos, not sudo

sudo bash infrastructure/deployment/ubuntu/repair-role-permissions.sh
# Expect: permissions = 16, SUPER_ADMIN perms = 16
```

- [ ] Repair script succeeded (or equivalent SQL against the real Postgres container)
- [ ] Hard-refresh / log out+in on `https://vault.ivaultstack.com`
- [ ] Nav shows Storage, Artifacts, Backups, Infrastructure, Access, Activity

### 3. Pull latest git + upgrade images (seed on migrate/API boot)

GitHub code already has permission seed + THANOS docs (`origin/main`). THANOS
checkout / images may be behind. `sudo upgrade.sh` previously failed:

`Permission denied (publickey)` on `git@github.com`.

```bash
# As thanos (not sudo):
cd /srv/src/private-cloud-storage-platform
git remote -v
# If SSH fails, switch:
#   git remote set-url origin https://github.com/iakash22/private-cloud-storage-platform.git
git fetch origin
git checkout main
git reset --hard origin/main

# Then upgrade without root doing fetch:
sudo VAULTSTACK_SKIP_GIT_FETCH=1 \
  bash infrastructure/deployment/ubuntu/upgrade.sh \
  /srv/src/private-cloud-storage-platform main
```

- [ ] `git` works as user `thanos` (HTTPS or SSH deploy key)
- [ ] `upgrade.sh` completed (backup + build + up)
- [ ] `migrate` container exited 0; API logs mention permission seed / listening
- [ ] Storage migrations applied, including advanced filter indexes
      (`20260913200000_advanced_storage_filters`) and folder-access integrity
      (`20260913201000_folder_access_integrity`); verify team membership,
      deepest-prefix precedence, upload/download denial, and recursive-operation
      ownership with the storage smoke tests
- [ ] `curl -fsS https://api.ivaultstack.com/ready` (or `/api/v1/ready`) OK

### 4. Chrome “Dangerous site” (Safe Browsing)

Not a VaultStack bug. New domain + login UI often false-positive.

- [ ] Open [Transparency Report](https://transparencyreport.google.com/safe-browsing/search?url=https://vault.ivaultstack.com) and note classification
- [ ] Verify `ivaultstack.com` in [Google Search Console](https://search.google.com/search-console)
- [ ] Request review under Security issues (private cloud control plane, not phishing)
- [ ] Temporary local bypass via Details → proceed (operators only)

---

## P1 — edge and networking

### 5. Cloudflare Tunnel origins

Expected mapping:

| Hostname                | Origin                  |
| ----------------------- | ----------------------- |
| `vault.ivaultstack.com` | `http://127.0.0.1:3100` |
| `api.ivaultstack.com`   | `http://127.0.0.1:3101` |
| `s3.ivaultstack.com`    | `http://127.0.0.1:3102` |

- [ ] Zero Trust → Public Hostnames include all three
- [ ] Compose (or override) actually publishes those localhost ports
- [ ] `curl` from THANOS to `127.0.0.1:3100/3101/3102` succeeds
- [ ] Public HTTPS returns dashboard / API ready / S3 gateway (not CF 404)

### 6. Caddy vs Tunnel

ISP often blocks inbound 80/443. Prefer Tunnel; avoid fighting Caddy ACME on the
same hostnames without a plan.

- [ ] Documented which edge is active (Tunnel recommended)
- [ ] If Tunnel-only: Caddy not required for public access
- [ ] Opsiva nginx still only on `127.0.0.1:80`

### 7. Firewall / published DB ports

THANOS override publishes Postgres `5433` and Redis `6380`.

- [ ] UFW (or equivalent) restricts `5433`/`6380` to LAN/Tailscale, not the world
- [ ] Confirm Opsiva Redis `6379` untouched

---

## P2 — ops hygiene

### 8. Compose helper and scripts on host

After upgrade, confirm:

- [ ] `/srv/vaultstack/compose/source/infrastructure/deployment/ubuntu/compose-lib.sh` exists
- [ ] `backup.sh` / `upgrade.sh` use both compose files via `vaultstack_compose`
- [ ] `docker-compose.ivaultstack.yml` still present (install/upgrade must not wipe customizations)

Suggested alias in `~/.bashrc` for `thanos`:

```bash
alias vs='sudo docker compose --env-file /srv/vaultstack/config/compose.env \
  -f /srv/vaultstack/compose/docker-compose.yml \
  -f /srv/vaultstack/compose/docker-compose.ivaultstack.yml'
```

- [ ] Alias installed

### 9. Backups

- [ ] `systemctl list-timers vaultstack-backup.timer` shows next run
- [ ] Manual `sudo bash …/backup.sh` creates archive under `/srv/vaultstack/backups`
- [ ] At least one archive copied **off** THANOS (USB / remote / other disk)

### 10. Secrets / Redis password

- [ ] Redis password rotated if it was exposed in logs/chat during bring-up
- [ ] `REDIS_URL` in `compose.env` matches `REDIS_PASSWORD` / requirepass
- [ ] Secret files readable by container `USER node` (typically `0644` files, `0700` dir)

### 11. Monitoring

- [ ] Grafana reachable via `ssh -L 3001:127.0.0.1:3001 thanos@192.168.1.9` → `http://127.0.0.1:3001`
- [ ] Login with `grafana_admin_password` secret
- [ ] VaultStack dashboard panels populate after traffic

### 12. Smoke test product paths

- [ ] Register/login + 2FA still works
- [ ] Create bucket / upload / download object
- [ ] Confirm object bytes under `/mnt/thanos-backup/vaultstack/data` (not in Postgres)
- [ ] S3 client against `https://s3.ivaultstack.com/api/v1/s3` (auth) if used
- [ ] Advanced object filters work in Storage → Files (content type, size, dates)
- [ ] Folder ACL deny/allow behaves for team and user grants
- [ ] Folder operation job progress updates in the dashboard without manual refresh
- [ ] Backup job progress updates in the dashboard without manual refresh

### 13. Transactional email (Resend)

Requires a verified sender domain in Resend. Secrets stay server-side only.

Add to `/srv/vaultstack/config/compose.env` (or a Docker secret file referenced from env):

```bash
RESEND_API_KEY=re_…                    # or RESEND_API_KEY_FILE=/run/secrets/resend_api_key
EMAIL_FROM="VaultStack <notifications@ivaultstack.com>"
EMAIL_ENABLED=true
DASHBOARD_PUBLIC_URL=https://vault.ivaultstack.com
```

- [ ] Resend API key stored under `/srv/vaultstack/config/secrets/` (mode `0600` dir, readable by container user)
- [ ] `EMAIL_FROM` domain verified in Resend
- [ ] Worker containers running (`worker` / cleanup role) so the `email-delivery` BullMQ queue is consumed
- [ ] Login from a new browser sends a login-detected email (check Resend dashboard)
- [ ] Inviting a user or adding a team member sends invitation email
- [ ] Failed login attempt email received for a known account

See [`docs/usage/notifications.md`](../usage/notifications.md).

### 14. Realtime SSE (dashboard push)

Uses the same Redis as BullMQ. Enabled by default when Redis is reachable.

```bash
REALTIME_ENABLED=true
REALTIME_MAX_CONNECTIONS_PER_USER=3
REALTIME_HEARTBEAT_SECONDS=30
```

- [ ] API logs show realtime hub started (no Redis subscribe errors)
- [ ] Dashboard open on `https://vault.ivaultstack.com` maintains an SSE connection (browser devtools → network → `realtime/events`)
- [ ] Revoking another session signs that browser out immediately
- [ ] Folder operation and backup job pages reflect progress without relying on fast polling alone

---

## P3 — nice to have / later

- [ ] Tag a release (`vX.Y.Z`) and document rollback ref in this file
- [ ] Tailscale-only admin SSH; disable password SSH if not already
- [ ] Off-site encrypted backup of `/srv/vaultstack/config/secrets` (secure store)
- [ ] Goal.md phases 20–24 (security audit, QA) when product smoke is green
- [ ] Remove temporary SQL/repair paste notes once seed-on-boot is verified forever

---

## Quick “am I done?” gate

All of these must be true:

1. Full nav visible for SUPER_ADMIN after login
2. `https://api.ivaultstack.com/ready` (or `/api/v1/ready`) OK
3. `https://vault.ivaultstack.com/` loads (warning aside)
4. Latest `main` images running after successful upgrade
5. Backup timer armed; at least one off-box archive
6. Email delivery verified (at least one auth/security message in Resend)
7. Realtime session-revoke push verified between two browsers

When all seven are true, flip the P0/P1/P2 boxes above and date this section.

---

## Commands cheat sheet (pending work)

```bash
# What is running?
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Repair nav permissions
sudo bash /srv/src/private-cloud-storage-platform/infrastructure/deployment/ubuntu/repair-role-permissions.sh

# Pull + upgrade (SSH broken under sudo)
cd /srv/src/private-cloud-storage-platform
git fetch origin && git reset --hard origin/main
sudo VAULTSTACK_SKIP_GIT_FETCH=1 bash infrastructure/deployment/ubuntu/upgrade.sh \
  /srv/src/private-cloud-storage-platform main

# Dashboard-only rebuild later
vs build dashboard && vs up -d --no-deps dashboard

# Schema / seed only
vs run --rm migrate
```

See also: `[thanos.md](./thanos.md)`, `.cursor/rules/thanos-deployment.mdc`.
