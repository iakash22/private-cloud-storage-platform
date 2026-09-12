#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

source_repo="${1:?Usage: upgrade.sh /path/to/vaultstack-repo [git-ref]}"
git_ref="${2:-main}"
root_dir="${VAULTSTACK_ROOT:-/srv/vaultstack}"
compose_dir="${root_dir}/compose"
monitoring_dir="${root_dir}/monitoring"
env_file="${root_dir}/config/compose.env"
compose_file="${compose_dir}/docker-compose.yml"
staging_dir="$(mktemp -d "${root_dir}/config/.upgrade.XXXXXX")"

cleanup() {
  rm -rf "${staging_dir}"
}
trap cleanup EXIT

if [[ ! -d "${source_repo}/.git" ]]; then
  echo "Source repository must be a Git checkout: ${source_repo}" >&2
  exit 1
fi

install -d -m 0755 "${monitoring_dir}"
bash "${source_repo}/infrastructure/deployment/ubuntu/backup.sh"

# Root often has no GitHub SSH key; run git as the checkout owner when possible.
repo_owner="$(stat -c '%U' "${source_repo}/.git" 2>/dev/null || true)"
run_git() {
  if [[ -n "${repo_owner}" && "${repo_owner}" != "root" ]] && id -u "${repo_owner}" >/dev/null 2>&1; then
    runuser -u "${repo_owner}" -- git -C "${source_repo}" "$@"
  else
    git -C "${source_repo}" "$@"
  fi
}

if [[ "${VAULTSTACK_SKIP_GIT_FETCH:-0}" == "1" ]]; then
  echo "Skipping git fetch (VAULTSTACK_SKIP_GIT_FETCH=1); packaging local ${git_ref}."
else
  run_git fetch --tags --prune
fi
run_git archive "${git_ref}" | tar -x -C "${staging_dir}"

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.vaultstack' \
  "${staging_dir}/" "${compose_dir}/source/"
install -m 0644 "${staging_dir}/infrastructure/docker/docker-compose.prod.yml" "${compose_file}"
install -m 0644 "${staging_dir}/infrastructure/docker/Caddyfile" "${compose_dir}/Caddyfile"
install -m 0644 "${staging_dir}/infrastructure/docker/s3-gateway.nginx.conf" \
  "${compose_dir}/s3-gateway.nginx.conf"
rsync -a --delete "${staging_dir}/infrastructure/monitoring/" "${monitoring_dir}/"

docker compose --env-file "${env_file}" -f "${compose_file}" build --pull
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --wait --remove-orphans
echo "VaultStack upgraded to ${git_ref}."
