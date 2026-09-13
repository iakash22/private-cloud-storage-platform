# VaultStack on THANOS (ivaultstack.com)

Operator runbook for the home Ubuntu host **THANOS**. This is the production
deployment for `*.ivaultstack.com`. Generic Docker notes live in
[README.md](./README.md); this page is THANOS-specific and must stay accurate
when the host layout changes.

## Snapshot

| Item | Value |
|------|--------|
| Host | `thanos@thanos` (LAN `192.168.1.9`, WAN historically `38.137.51.88`) |
| Domains | `vault.ivaultstack.com`, `api.ivaultstack.com`, `s3.ivaultstack.com` |
| App root | `/srv/vaultstack` |
| Git checkout | `/srv/src/private-cloud-storage-platform` |
| Object + DB data disk | `/mnt/thanos-backup` (label `THANOS-BACKUP`) |
| Process manager | systemd `vaultstack.service` → Docker Compose |
| Edge | Cloudflare Tunnel → localhost (preferred); Caddy on LAN IP is optional/legacy |
| Coexists with | Opsiva (PM2 + nginx on `127.0.0.1:80` + its own tunnel routes) |

**Do not** put VaultStack on Opsiva’s Redis (`6379`) or Postgres. **Do not** bind
VaultStack HTTP to `127.0.0.1:80` (Opsiva nginx owns that).

### Pending work on the server

Open checklist of what is still incomplete on THANOS (permissions repair, git
upgrade, Tunnel ports, Safe Browsing, backups, Resend email, realtime SSE,
smoke tests):

→ **[`thanos-pending.md`](./thanos-pending.md)**

Update that file as you complete items on the host.

---

## Disk and directory layout

```text
/mnt/thanos-backup/vaultstack/     # durable disk (bind-mounted into Compose)
├── data/                          # LocalFilesystemStorageProvider objects (UID 1000)
├── postgres/                      # PostgreSQL data directory
├── redis/                         # Redis AOF / RDB
└── backups/                       # optional off-root copy of backup archives

/srv/vaultstack/                   # control plane on root filesystem
├── compose/
│   ├── docker-compose.yml         # copy of docker-compose.prod.yml
│   ├── docker-compose.ivaultstack.yml   # THANOS overrides (ports, volumes, Redis auth)
│   ├── Caddyfile
│   ├── s3-gateway.nginx.conf
│   └── source/                    # rsync’d repo used as Docker build context
├── config/
│   ├── compose.env                # mode 0600
│   ├── compose.env.example
│   └── secrets/                   # Docker file secrets (dir 0700; files often 0644 for USER node)
│       ├── database_url
│       ├── jwt_secret
│       ├── postgres_password
│       ├── metrics_token
│       ├── grafana_admin_password
│       └── redis_password         # used by compose.env REDIS_PASSWORD (host-side)
├── data -> /mnt/thanos-backup/vaultstack/data     # symlink (recommended)
├── backups -> /mnt/thanos-backup/vaultstack/backups
├── monitoring/                    # Prometheus / Grafana / Loki config
└── logs/

/srv/src/private-cloud-storage-platform/   # git clone for upgrade.sh
```

Create data dirs (once):

```bash
sudo mkdir -p /mnt/thanos-backup/vaultstack/{data,postgres,redis,backups}
sudo chown 1000:1000 /mnt/thanos-backup/vaultstack/data
sudo chmod 0750 /mnt/thanos-backup/vaultstack/data
sudo chmod 0700 /mnt/thanos-backup/vaultstack/backups
sudo ln -sfn /mnt/thanos-backup/vaultstack/data /srv/vaultstack/data
sudo ln -sfn /mnt/thanos-backup/vaultstack/backups /srv/vaultstack/backups
```

What lives where:

| Data | Where | Notes |
|------|--------|--------|
| File binaries / objects | `/mnt/thanos-backup/vaultstack/data` | Never in PostgreSQL |
| Metadata (users, orgs, roles, buckets, audit, …) | Postgres volume on backup disk | Prisma schema in `packages/database/prisma/` |
| Queues / sessions cache | Redis on backup disk | Password required on THANOS |
| TLS / Caddy state | Docker volume `caddy_data` (if Caddy used) | Not used when edge is Tunnel-only |
| App images / containers | Docker on root disk | Rebuild does not wipe data volumes |

---

## What runs (services)

Compose project name: `vaultstack` (`COMPOSE_PROJECT_NAME`). Container names are
usually `vaultstack-<service>-1` (for example `vaultstack-postgres-1`), **not**
the dev name `vaultstack-postgres`.

| Service | Role | Typical health |
|---------|------|----------------|
| `migrate` | One-shot: `prisma migrate deploy` + permission seed | Exits 0 |
| `api` | Express API (`USER node`) | `/ready` |
| `dashboard` | Static Vite build behind nginx | `/healthz` |
| `s3-gateway` | nginx reverse proxy to API S3 routes | healthy |
| `backup-worker` | BullMQ backup jobs | healthy |
| `artifact-worker` | BullMQ artifact / lifecycle jobs | healthy |
| `preview-worker` | BullMQ archive listing and LibreOffice conversion jobs | healthy |
| `postgres` | Metadata DB | `pg_isready` |
| `redis` | BullMQ + cache | `PING` (auth) |
| `caddy` | Public TLS reverse proxy (optional on THANOS) | `/healthz` |
| `prometheus`, `grafana`, `loki`, `promtail`, exporters | Observability | Grafana on `127.0.0.1:3001` |

Images:

- **API + workers + migrate**: Dockerfile target `api-runtime`
- **Dashboard only**: Dockerfile target `dashboard` (build arg `VITE_API_URL`)

---

## Networking and edge (THANOS reality)

### Domains

| Hostname | Purpose |
|----------|---------|
| `vault.ivaultstack.com` | Dashboard |
| `api.ivaultstack.com` | API (`/api/v1/...`, `/ready`, `/health`) |
| `s3.ivaultstack.com` | S3-compatible gateway prefix `/api/v1/s3` |

DNS is on Cloudflare. ISP often blocks inbound **80/443**, so **Cloudflare Tunnel**
is the reliable public path. Public A-record → home WAN + Caddy ACME is fragile
on this ISP.

### Cloudflare Tunnel (current production path)

`cloudflared` on the host publishes public hostnames to local ports. Typical
mapping used on THANOS:

| Public hostname | Local origin |
|-----------------|--------------|
| `vault.ivaultstack.com` | `http://127.0.0.1:3100` |
| `api.ivaultstack.com` | `http://127.0.0.1:3101` |
| `s3.ivaultstack.com` | `http://127.0.0.1:3102` |

Those localhost ports must be published by Compose (override or manual publish).
If Tunnel hostnames are missing in Zero Trust → Public Hostnames, you get
Cloudflare 404 even when containers are healthy.

Tunnel config may live in Zero Trust UI (remote config) and/or
`/etc/cloudflared/config.yml`. Remote UI config overrides a stale local file.

### Caddy path (optional / LAN)

`docker-compose.ivaultstack.yml` binds Caddy to
`${VAULTSTACK_PUBLIC_IP}:80/443` (e.g. `192.168.1.9`) so Opsiva keeps
`127.0.0.1:80`. Requires working ACME or custom certs; do not fight the tunnel
on the same hostnames without a clear plan.

### Host ports from ivaultstack override

| Port on host | Service | Notes |
|--------------|---------|--------|
| `5433` | Postgres | Remote admin; firewall carefully |
| `6380` | Redis | Password required; not Opsiva’s `6379` |
| `80/443` on LAN IP | Caddy | Only if Caddy profile/path enabled |
| `127.0.0.1:3001` | Grafana | SSH tunnel recommended |

---

## Compose helper (always use both files)

```bash
# Recommended alias on THANOS
alias vs='sudo docker compose --env-file /srv/vaultstack/config/compose.env \
  -f /srv/vaultstack/compose/docker-compose.yml \
  -f /srv/vaultstack/compose/docker-compose.ivaultstack.yml'
```

Scripts under `infrastructure/deployment/ubuntu/` should call `compose-lib.sh`
(`vaultstack_compose`) so the override is never forgotten. systemd
`vaultstack.service` already appends the override when the file exists.

---

## First install (reference)

```bash
sudo mkdir -p /srv/src
cd /srv/src
# Prefer HTTPS if sudo/root has no GitHub SSH key:
git clone git@github.com:iakash22/private-cloud-storage-platform.git
# or: git clone git@github.com:iakash22/private-cloud-storage-platform.git

cd /srv/src/private-cloud-storage-platform
sudo bash infrastructure/deployment/ubuntu/install.sh
sudo bash infrastructure/deployment/ubuntu/init-secrets.sh

# Redis password for THANOS override
sudo bash -c 'umask 077; openssl rand -hex 24 > /srv/vaultstack/config/secrets/redis_password'
sudo chmod 0644 /srv/vaultstack/config/secrets/redis_password   # or keep 0600 and inject carefully

# Edit compose.env (domains, VAULTSTACK_*_ROOT, REDIS_PASSWORD, REDIS_URL, VAULTSTACK_PUBLIC_IP)
sudoedit /srv/vaultstack/config/compose.env

# Ensure override exists
sudo test -f /srv/vaultstack/compose/docker-compose.ivaultstack.yml

sudo systemctl daemon-reload
sudo systemctl enable --now vaultstack
sudo systemctl status vaultstack --no-pager
```

`install.sh` will not overwrite an existing customized
`docker-compose.ivaultstack.yml`.

---

## Status and health commands

```bash
# systemd
sudo systemctl status vaultstack --no-pager
sudo systemctl list-timers vaultstack-backup.timer
sudo journalctl -u vaultstack -n 100 --no-pager

# containers (names vary; list first)
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
vs ps
vs ps --format 'table {{.Service}}\t{{.Name}}\t{{.Status}}\t{{.Health}}'

# public / API checks
curl -fsS https://api.ivaultstack.com/health
curl -fsS https://api.ivaultstack.com/ready
curl -fsS -o /dev/null -w '%{http_code}\n' https://vault.ivaultstack.com/
curl -sS -o /dev/null -w '%{http_code}\n' https://s3.ivaultstack.com/api/v1/s3

# inside API container
vs exec api node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1))"

# post-reboot script (expects Caddy HTTPS path; adjust if Tunnel-only)
sudo bash /srv/src/private-cloud-storage-platform/infrastructure/deployment/ubuntu/verify-after-reboot.sh
```

Find Postgres container when the name is not obvious:

```bash
sudo docker ps -a --format '{{.Names}}' | grep -i postgres
# often: vaultstack-postgres-1
```

---

## PostgreSQL access

**Credentials:** `POSTGRES_USER` / `POSTGRES_DB` from `compose.env` (default
`vaultstack` / `vaultstack`). Password in
`/srv/vaultstack/config/secrets/postgres_password`.  
`database_url` must use Compose hostname `postgres` and the same password.

### From the host (published `5433`)

```bash
export PGPASSWORD="$(sudo cat /srv/vaultstack/config/secrets/postgres_password)"
psql -h 127.0.0.1 -p 5433 -U vaultstack -d vaultstack
```

### Via Docker (no local client needed)

```bash
PG="$(sudo docker ps --format '{{.Names}}' | grep -E 'postgres' | head -1)"
sudo docker exec -it "$PG" \
  sh -c 'export PGPASSWORD="$(cat /run/secrets/postgres_password)"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Useful checks

```sql
SELECT count(*) AS permissions FROM "Permission";
SELECT r.name, count(rp."permissionId") AS perms
FROM "Role" r
LEFT JOIN "RolePermission" rp ON rp."roleId" = r.id
WHERE r."isSystem"
GROUP BY r.name
ORDER BY r.name;
-- Expect SUPER_ADMIN with 16 permissions after seed/repair.
```

Schema source of truth: `packages/database/prisma/schema.prisma`  
Human summary: `docs/architecture/database-schema.md`  
Migrations apply via the `migrate` service (and API also seeds permissions on boot).

Repair empty role grants (if dashboard only shows Dashboard + Settings):

```bash
sudo bash /srv/src/private-cloud-storage-platform/infrastructure/deployment/ubuntu/repair-role-permissions.sh
# or docker exec -i <postgres-container> psql ... (see script)
```

Never store object binaries in Postgres.

---

## Redis access

Password: `REDIS_PASSWORD` in `compose.env` (and/or secrets file).  
URL for API/workers: `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379` (Compose DNS).

```bash
# host port 6380
redis-cli -h 127.0.0.1 -p 6380 -a "$(grep ^REDIS_PASSWORD= /srv/vaultstack/config/compose.env | cut -d= -f2-)" ping

# via container
vs exec redis redis-cli -a "$REDIS_PASSWORD" ping
```

Do not point VaultStack at host Redis `6379` (Opsiva).

---

## Updates and rebuilds

### Full upgrade (preferred)

```bash
cd /srv/src/private-cloud-storage-platform

# Pull as thanos (not sudo) so GitHub SSH/HTTPS credentials work
git remote -v
git fetch origin
git checkout main
git reset --hard origin/main

# If sudo git fetch fails with Permission denied (publickey):
sudo VAULTSTACK_SKIP_GIT_FETCH=1 \
  bash infrastructure/deployment/ubuntu/upgrade.sh /srv/src/private-cloud-storage-platform main
```

`upgrade.sh` creates a backup, archives the git ref into
`/srv/vaultstack/compose/source/`, refreshes compose/Caddy/monitoring files,
then `build --pull` + `up -d --wait`.

If the repo is private and SSH fails under every user, switch remote to HTTPS
+ PAT, or `git bundle` / `rsync` from a machine that can pull.

### Rollback

```bash
sudo bash infrastructure/deployment/ubuntu/rollback.sh \
  <known-good-ref> /srv/src/private-cloud-storage-platform
```

Migrations are **forward-only**. Image rollback does not undo schema. Always
backup first.

### Rebuild only the dashboard

Use when UI/CSS/routes change but API/schema did not:

```bash
vs build dashboard
vs up -d --no-deps dashboard
# Hard-refresh the browser (Cloudflare/CDN cache may linger briefly).
```

`VITE_API_URL` is baked at **image build** time from `compose.env`. Changing the
API URL requires a dashboard rebuild.

### Rebuild only API / workers (no dashboard)

Preview jobs are durable in PostgreSQL and execute in `preview-worker`. Its
image includes LibreOffice for Office-to-PDF conversion; ZIP/TAR inspection is
bounded and never extracts archive members into the public storage namespace.

```bash
vs build api
vs up -d --no-deps api backup-worker artifact-worker preview-worker
# migrate runs as a dependency of api on full `up`; for schema-only:
vs run --rm migrate
```

### Schema / Prisma migrations only

```bash
vs run --rm migrate
# migrate = prisma migrate deploy + seedDatabase (permissions + role sync)
vs logs migrate
```

After schema changes in git, prefer a full `upgrade.sh` so `compose/source`
and images match the migration files.

### Rebuild everything without git

```bash
vs build
vs up -d --wait --remove-orphans
sudo systemctl restart vaultstack   # optional; aligns with unit
```

---

## Backups

Daily timer: `vaultstack-backup.timer` → `backup.sh`.

```bash
sudo bash /srv/src/private-cloud-storage-platform/infrastructure/deployment/ubuntu/backup.sh
ls -lh /srv/vaultstack/backups/
```

Each archive: Postgres `pg_dump` + tarball of object data + checksums. Copy
archives off the box; the backup disk alone is not off-site DR.

---

## Secrets and env

| File / key | Purpose |
|------------|---------|
| `secrets/database_url` | `postgresql://vaultstack:…@postgres:5432/vaultstack` |
| `secrets/jwt_secret` | Sessions / TOTP sealing |
| `secrets/postgres_password` | DB password (must match URL) |
| `secrets/metrics_token` | Bearer for `/metrics` scrape |
| `secrets/grafana_admin_password` | Grafana admin |
| `compose.env` | Domains, paths, Redis, CORS, build context |
| `compose.env` → `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email (Resend); see pending §13 |
| `compose.env` → `DASHBOARD_PUBLIC_URL` | Link target in auth/security emails |
| `compose.env` → `REALTIME_*` | SSE hub tuning (enabled by default when Redis is up); see pending §14 |
| `secrets/resend_api_key` (optional) | Alternative to inline `RESEND_API_KEY` |

After adding email or realtime env vars, rebuild API and worker images and verify
with [`thanos-pending.md`](./thanos-pending.md) sections **13** and **14**.

Rotate deliberately with `FORCE_REGENERATE_SECRETS=true` on `init-secrets.sh`
(breaks existing sessions / DB URL unless Postgres password is updated in
lockstep). Never commit secrets. Never put S3/MinIO admin keys in the
dashboard.

---

## Opsiva coexistence checklist

| Resource | Opsiva | VaultStack |
|----------|--------|------------|
| HTTP on loopback | nginx `127.0.0.1:80` | Do not steal this |
| Redis | host `:6379` | Docker Redis, host publish `:6380` only |
| Process model | PM2 | Docker + systemd `vaultstack` |
| Tunnel hostnames | `*.opsiva.in` (etc.) | `vault` / `api` / `s3` `.ivaultstack.com` |

---

## Chrome “Dangerous site”

A red Safe Browsing interstitial is **not** a VaultStack SPA routing bug
(`/settings` reload is handled by dashboard nginx `try_files`). New domains
with login UIs are often false-positives.

1. Transparency Report for the hostname  
2. Google Search Console → verify domain → Security issues → Request review  
3. Temporary: Details → proceed (local browser only)

---

## Troubleshooting table

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Only Dashboard + Settings in UI | Empty `RolePermission` (seed never ran) | Repair script / `migrate` / API seed; hard refresh |
| `No such container: vaultstack-postgres` | Prod name is `vaultstack-postgres-1` | `docker ps \| grep postgres` |
| `git fetch` Permission denied under sudo | Root has no GitHub key | Pull as `thanos`; `VAULTSTACK_SKIP_GIT_FETCH=1` |
| Cloudflare 404 on vault/api/s3 | Tunnel public hostname missing | Zero Trust → add hostname → localhost port |
| ACME / Caddy timeout | ISP blocks 80/443 | Use Cloudflare Tunnel; disable conflicting Caddy |
| API 401 after deploy | JWT secret rotated or cookies cross-domain | Check `CORS_ORIGINS`, `VITE_API_URL`, secrets |
| `down -v` | Deletes named volumes | Never for routine restart |
| Nav missing after SQL repair | Session cached empty permissions | Log out/in or hard refresh |

---

## Agent / human quick paths

```text
Status:     systemctl status vaultstack ; vs ps
Logs:       vs logs -f api dashboard
DB shell:   docker exec -it $(docker ps -qf name=postgres) …
Redis:      redis-cli -p 6380 -a … ping
Upgrade:    git pull (as thanos) → VAULTSTACK_SKIP_GIT_FETCH=1 upgrade.sh
UI only:    vs build dashboard && vs up -d --no-deps dashboard
Schema:     vs run --rm migrate
Backup:     backup.sh ; copy archives off-host
```

Related files:

- `infrastructure/docker/docker-compose.prod.yml`
- `infrastructure/docker/docker-compose.ivaultstack.yml`
- `infrastructure/deployment/ubuntu/*`
- `docs/architecture/database-schema.md`
- `docs/deployment/README.md`
