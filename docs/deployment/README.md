# VaultStack Docker deployment

Phase 17 provides a production-oriented Compose topology in
`infrastructure/docker/docker-compose.prod.yml`.

## Topology

Only Caddy publishes host ports (`80` and `443`). It routes
`DASHBOARD_DOMAIN` to the dashboard, `API_DOMAIN` to the API, and
`S3_DOMAIN` to the S3 gateway. PostgreSQL,
Redis, and the workers are attached only to the internal network. The S3
gateway is an unprivileged reverse-proxy boundary; signing and authorization
remain in the API.

The API and both workers use the same image with different commands. The
`backup-worker` processes backup jobs. The `artifact-worker` processes
multipart cleanup, lifecycle, and artifact retention jobs. This prevents two
worker containers from consuming the same queue.

## Production storage

Create the object-data directory before starting Compose:

```bash
sudo install -d -o 1000 -g 1000 -m 0750 /srv/vaultstack/data
```

The default `vaultstack_data` volume is a bind mount to
`/srv/vaultstack/data`. Set `VAULTSTACK_DATA_ROOT` if the persistent disk is
mounted elsewhere. Object data is never stored only in a container writable
layer.

PostgreSQL, Redis, and Caddy state use named persistent volumes.

## First deployment

1. Copy the three files described in
   `infrastructure/docker/secrets/README.md` to the host.
2. Set `DASHBOARD_DOMAIN`, `API_DOMAIN`, and `S3_DOMAIN` to public DNS names,
   set `VITE_API_URL` to the API URL, and set `CORS_ORIGINS` to the dashboard
   origin. Caddy will obtain and renew TLS certificates for all three names.
3. Build and start the stack:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml build
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d
docker compose -f infrastructure/docker/docker-compose.prod.yml ps
```

The one-shot `migrate` service runs Prisma migrations before the API and
workers start. Its completed state is retained by Compose for subsequent
restarts.

## Operational checks

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml build
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --wait
docker compose -f infrastructure/docker/docker-compose.prod.yml ps
docker compose -f infrastructure/docker/docker-compose.prod.yml exec api \
  node -e "fetch('http://127.0.0.1:3000/ready').then(r => process.exit(r.ok ? 0 : 1))"
docker compose -f infrastructure/docker/docker-compose.prod.yml restart postgres redis api
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --wait
```

For the persistence test, upload an object through the dashboard or S3
endpoint, then run:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --force-recreate api backup-worker artifact-worker
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --wait
```

Download the same object and compare its checksum. Repeat the test after
recreating PostgreSQL and Redis to verify their named volumes. Never use
`down -v` for a routine restart because it deletes named volumes.

## Secret and network rules

Do not publish PostgreSQL or Redis ports. Do not pass provider access keys to
the dashboard. The API reads `DATABASE_URL` and `JWT_SECRET` from Docker
secret files, and provider credentials remain server-side environment values.
Keep the private network marked `internal: true`.

## Ubuntu home-server deployment

Phase 18 deploys the stack under this host layout:

```text
/srv/vaultstack/
├── compose/    # Compose file, Caddy config, and build context
├── data/       # LocalFilesystemStorageProvider object data
├── backups/    # Local backup staging; copy encrypted archives off-host
├── config/     # compose.env and Docker secrets
└── logs/       # reserved for host-side operational logs
```

The production storage engine is the local filesystem provider. MinIO is not
required and must not be added as a hidden dependency.

### Installation and environment

On a fresh Ubuntu host, install Tailscale and authenticate it for private
administration. Clone VaultStack to a working directory, then run:

```bash
sudo bash infrastructure/deployment/ubuntu/install.sh
sudo bash infrastructure/deployment/ubuntu/init-secrets.sh
sudoedit /srv/vaultstack/config/compose.env
```

Set `DASHBOARD_DOMAIN`, `API_DOMAIN`, `S3_DOMAIN`, `VITE_API_URL`, and
`CORS_ORIGINS` to the deployment's DNS names. The example values are
`vault.example.com`, `api.vault.example.com`, and `s3.example.com`.
Keep `S3_ALLOW_PRIVATE_ENDPOINTS=false` unless a trusted operator intentionally
needs a self-hosted S3 endpoint on a private network; enabling it expands the
API's SSRF boundary.

Create DNS A/AAAA records for all three names before starting Caddy. The
installer creates `/srv/vaultstack/data` owned by UID/GID `1000`, which is the
non-root API/worker user in the container.

### Secrets and first start

Secrets are root-owned, mode `0600`, and never enter the dashboard image:

```bash
sudo bash infrastructure/deployment/ubuntu/init-secrets.sh
sudo systemctl start vaultstack
sudo docker compose --env-file /srv/vaultstack/config/compose.env \
  -f /srv/vaultstack/compose/docker-compose.yml ps
```

`database_url` must use the Compose hostname `postgres`, and its password
must match `postgres_password`. The `migrate` one-shot service runs
`prisma migrate deploy` before the API and workers start.

### Firewall, private administration, and TLS

Use Tailscale for SSH and administration. The firewall script refuses to
enable UFW unless `tailscale0` exists, unless public SSH is explicitly
allowed:

```bash
sudo bash infrastructure/deployment/ubuntu/configure-ufw.sh
sudo ufw status verbose
```

UFW permits only HTTP/HTTPS publicly and SSH through Tailscale. PostgreSQL
5432 and Redis 6379 have no host ports and no firewall rules. Caddy obtains
and renews certificates through ACME, so public TCP 80 and 443 and correct
DNS records are required.

### Backups

Run the backup script from a root cron job or systemd timer:

```bash
sudo bash infrastructure/deployment/ubuntu/backup.sh
```

The installer also enables the daily `vaultstack-backup.timer`; inspect it
with `systemctl list-timers vaultstack-backup.timer`.

Each archive contains a PostgreSQL metadata dump, a tarball of
`/srv/vaultstack/data`, and checksums. Copy archives to a separate disk or
remote backup target; `/srv/vaultstack/backups` alone is not disaster
recovery.

### Upgrade and rollback

Builds use a Git ref from a separate checkout. The upgrade script creates a
backup, stages the requested ref, rebuilds the images, and starts the stack:

```bash
sudo bash infrastructure/deployment/ubuntu/upgrade.sh \
  /srv/src/private-cloud-storage-platform v1.0.0
```

Rollback to a known-good tag with:

```bash
sudo bash infrastructure/deployment/ubuntu/rollback.sh \
  v0.9.0 /srv/src/private-cloud-storage-platform
```

Database migrations are forward-only. Take a backup before upgrades; rolling
back application images does not automatically roll back PostgreSQL schema
changes.

### Reboot validation

The systemd unit enables the Compose stack at boot. After a host reboot:

```bash
sudo bash infrastructure/deployment/ubuntu/verify-after-reboot.sh
```

This verifies Docker/systemd recovery, container health, persistent storage,
the dashboard, the API readiness endpoint, and that the S3 hostname reaches
the gateway. Configure S3 clients with the endpoint
`https://s3.example.com/api/v1/s3` (using the configured `S3_DOMAIN`) and
perform an authenticated upload/download checksum test as part of the release
checklist.

## Monitoring and observability

The production Compose file also starts Prometheus, Grafana, Loki, Promtail,
node-exporter, and PostgreSQL/Redis exporters on an internal monitoring
network. Grafana is bound only to `127.0.0.1:3001`; Prometheus and Loki have
no host ports. Access Grafana through a Tailscale SSH tunnel:

```bash
ssh -L 3001:127.0.0.1:3001 admin@vaultstack-host
```

Open `http://127.0.0.1:3001` and use the generated
`grafana_admin_password` secret. The provisioned VaultStack dashboard covers
API/S3 traffic, latency, errors, throughput, storage capacity, object/upload
counts, worker queues, PostgreSQL, Redis, and container logs.

The API `/metrics` endpoint requires the `metrics_token` secret and is only
scraped on the private Docker network. It is not a public unauthenticated
endpoint. Logger redaction remains enabled for passwords, tokens,
credentials, URLs, request bodies, and file contents.

Generate validation traffic and inspect the metrics directly:

```bash
curl -fsS https://vault.example.com/
curl -fsS https://api.vault.example.com/api/v1/ready
docker compose --env-file /srv/vaultstack/config/compose.env \
  -f /srv/vaultstack/compose/docker-compose.yml exec prometheus \
  sh -c 'wget -qO- --header="Authorization: Bearer $(cat /run/secrets/metrics_token)" \
  http://api:3000/metrics'
```

Perform authenticated dashboard and S3 uploads/downloads as well; verify
`vaultstack_s3_requests_total`, request latency, byte counters, and queue
gauges increase. Check the Grafana dashboard and Loki logs afterward.

Validate alert rules before a release:

```bash
promtool test rules infrastructure/monitoring/prometheus/rules/vaultstack-alerts.test.yml
docker compose --env-file /srv/vaultstack/config/compose.env \
  -f /srv/vaultstack/compose/docker-compose.yml exec prometheus \
  promtool check rules /etc/prometheus/rules/vaultstack-alerts.yml
```

The alert set covers API, PostgreSQL, Redis, disk capacity, provider errors,
backup failures, high error rate, high latency, and storage integrity
indicators. Use a controlled staging fault or maintenance window to verify
end-to-end alert firing; do not fill production storage to test disk alerts.
