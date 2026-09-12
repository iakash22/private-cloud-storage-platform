#!/usr/bin/env bash
set -euo pipefail

root_dir="${VAULTSTACK_ROOT:-/srv/vaultstack}"
env_file="${root_dir}/config/compose.env"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-lib.sh
source "${script_dir}/compose-lib.sh"

if [[ ! -f "${env_file}" || ! -f "${root_dir}/compose/docker-compose.yml" ]]; then
  echo "VaultStack is not installed at ${root_dir}." >&2
  exit 1
fi

systemctl is-active --quiet docker
systemctl is-active --quiet vaultstack

vaultstack_compose up -d --wait

for service in dashboard api s3-gateway postgres redis backup-worker artifact-worker; do
  status="$(vaultstack_compose ps --format '{{.Service}} {{.Health}}' "${service}")"
  case "${status}" in
    *healthy*) ;;
    *)
      echo "Service is not healthy: ${status}" >&2
      exit 1
      ;;
  esac
done

# Caddy is optional when Cloudflare Tunnel fronts localhost ports.
if vaultstack_compose ps --services 2>/dev/null | grep -qx caddy; then
  caddy_status="$(vaultstack_compose ps --format '{{.Service}} {{.Health}}' caddy || true)"
  case "${caddy_status}" in
    *healthy*) ;;
    *running*) ;;
    *)
      echo "Warning: caddy is not healthy (${caddy_status}); continuing if Tunnel edge is used." >&2
      ;;
  esac
fi

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

curl --fail --silent --show-error "https://${DASHBOARD_DOMAIN}/" >/dev/null
curl --fail --silent --show-error "https://${API_DOMAIN}/ready" >/dev/null \
  || curl --fail --silent --show-error "https://${API_DOMAIN}/api/v1/ready" >/dev/null

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
