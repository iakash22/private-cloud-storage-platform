#!/usr/bin/env bash
set -euo pipefail

root_dir="${VAULTSTACK_ROOT:-/srv/vaultstack}"
env_file="${root_dir}/config/compose.env"
compose_file="${root_dir}/compose/docker-compose.yml"

if [[ ! -f "${env_file}" || ! -f "${compose_file}" ]]; then
  echo "VaultStack is not installed at ${root_dir}." >&2
  exit 1
fi

systemctl is-active --quiet docker
systemctl is-active --quiet vaultstack

docker compose --env-file "${env_file}" -f "${compose_file}" up -d --wait

for service in caddy dashboard api s3-gateway postgres redis backup-worker artifact-worker; do
  status="$(docker compose --env-file "${env_file}" -f "${compose_file}" ps --format '{{.Service}} {{.Health}}' "${service}")"
  case "${status}" in
    *healthy*) ;;
    *)
      echo "Service is not healthy: ${status}" >&2
      exit 1
      ;;
  esac
done

source "${env_file}"
curl --fail --silent --show-error "https://${DASHBOARD_DOMAIN}/" >/dev/null
curl --fail --silent --show-error "https://${API_DOMAIN}/api/v1/ready" >/dev/null

# An unauthenticated S3 request should still reach the gateway and return an
# S3 response (normally 403), rather than a proxy or TLS error.
s3_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "https://${S3_DOMAIN}/api/v1/s3")"
case "${s3_status}" in
  400|403|501) ;;
  *)
    echo "Unexpected S3 gateway status: ${s3_status}" >&2
    exit 1
    ;;
esac

test -d "${root_dir}/data"
echo "VaultStack passed post-reboot service, dashboard, API, S3, and storage checks."
