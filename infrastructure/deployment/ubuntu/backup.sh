#!/usr/bin/env bash
set -euo pipefail

root_dir="${VAULTSTACK_ROOT:-/srv/vaultstack}"
compose_file="${root_dir}/compose/docker-compose.yml"
env_file="${root_dir}/config/compose.env"
backup_dir="${root_dir}/backups"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d "${backup_dir}/.backup-${stamp}.XXXXXX")"
archive="${backup_dir}/vaultstack-${stamp}.tar.gz"

cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

if [[ ! -f "${compose_file}" || ! -f "${env_file}" ]]; then
  echo "VaultStack is not installed at ${root_dir}." >&2
  exit 1
fi

install -d -m 0700 "${backup_dir}"

docker compose --env-file "${env_file}" -f "${compose_file}" exec -T postgres \
  sh -c 'export PGPASSWORD="$(cat /run/secrets/postgres_password)"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "${work_dir}/metadata.sql"

tar --numeric-owner --xattrs --acls \
  -C "${root_dir}/data" -czf "${work_dir}/objects.tar.gz" .

{
  printf 'created_at=%s\n' "${stamp}"
  printf 'database_dump=metadata.sql\n'
  printf 'object_archive=objects.tar.gz\n'
  sha256sum "${work_dir}/metadata.sql" "${work_dir}/objects.tar.gz"
} > "${work_dir}/manifest.txt"

tar -C "${work_dir}" -czf "${archive}" metadata.sql objects.tar.gz manifest.txt
chmod 0600 "${archive}"
find "${backup_dir}" -maxdepth 1 -type f -name 'vaultstack-*.tar.gz' \
  -mtime "+${retention_days}" -delete

echo "Created ${archive}"
