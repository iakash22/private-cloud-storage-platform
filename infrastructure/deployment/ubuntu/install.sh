#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root (sudo)." >&2
  exit 1
fi

source_dir="${VAULTSTACK_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
root_dir="${VAULTSTACK_ROOT:-/srv/vaultstack}"
compose_dir="${root_dir}/compose"
config_dir="${root_dir}/config"
secret_dir="${config_dir}/secrets"
monitoring_dir="${root_dir}/monitoring"

if [[ ! -f "${source_dir}/infrastructure/docker/docker-compose.prod.yml" ]]; then
  echo "Source directory does not contain the VaultStack production Compose file: ${source_dir}" >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl openssl rsync

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
fi

systemctl enable --now docker
docker compose version >/dev/null

install -d -m 0755 "${compose_dir}" "${config_dir}" "${secret_dir}" "${monitoring_dir}" "${root_dir}/logs"
install -d -o 1000 -g 1000 -m 0750 "${root_dir}/data"
install -d -m 0700 "${root_dir}/backups"

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.vaultstack' \
  "${source_dir}/" "${compose_dir}/source/"

install -m 0644 \
  "${source_dir}/infrastructure/docker/docker-compose.prod.yml" \
  "${compose_dir}/docker-compose.yml"
install -m 0644 \
  "${source_dir}/infrastructure/docker/Caddyfile" \
  "${compose_dir}/Caddyfile"
install -m 0644 \
  "${source_dir}/infrastructure/docker/s3-gateway.nginx.conf" \
  "${compose_dir}/s3-gateway.nginx.conf"
rsync -a --delete \
  "${source_dir}/infrastructure/monitoring/" "${monitoring_dir}/"
install -m 0644 \
  "${source_dir}/infrastructure/deployment/ubuntu/compose.env.example" \
  "${config_dir}/compose.env.example"

if [[ ! -f "${config_dir}/compose.env" ]]; then
  cp "${config_dir}/compose.env.example" "${config_dir}/compose.env"
  chmod 0600 "${config_dir}/compose.env"
  echo "Created ${config_dir}/compose.env; edit domains before starting VaultStack."
fi

if [[ ! -f "${secret_dir}/database_url" ]]; then
  install -m 0600 /dev/null "${secret_dir}/database_url"
fi
if [[ ! -f "${secret_dir}/jwt_secret" ]]; then
  install -m 0600 /dev/null "${secret_dir}/jwt_secret"
fi
if [[ ! -f "${secret_dir}/postgres_password" ]]; then
  install -m 0600 /dev/null "${secret_dir}/postgres_password"
fi
if [[ ! -f "${secret_dir}/metrics_token" ]]; then
  install -m 0600 /dev/null "${secret_dir}/metrics_token"
fi
if [[ ! -f "${secret_dir}/grafana_admin_password" ]]; then
  install -m 0600 /dev/null "${secret_dir}/grafana_admin_password"
fi

install -m 0644 \
  "${source_dir}/infrastructure/deployment/ubuntu/vaultstack.service" \
  /etc/systemd/system/vaultstack.service
install -m 0644 \
  "${source_dir}/infrastructure/deployment/ubuntu/vaultstack-backup.service" \
  /etc/systemd/system/vaultstack-backup.service
install -m 0644 \
  "${source_dir}/infrastructure/deployment/ubuntu/vaultstack-backup.timer" \
  /etc/systemd/system/vaultstack-backup.timer
systemctl daemon-reload
systemctl enable vaultstack.service
systemctl enable --now vaultstack-backup.timer

cat <<EOF
VaultStack host layout is ready at ${root_dir}.

Next steps:
  1. Edit ${config_dir}/compose.env.
  2. Populate ${secret_dir}/database_url, jwt_secret, and postgres_password.
  3. Configure DNS, Tailscale, and UFW.
  4. Start with: systemctl start vaultstack
  5. Check scheduled backups with: systemctl list-timers vaultstack-backup.timer
EOF
