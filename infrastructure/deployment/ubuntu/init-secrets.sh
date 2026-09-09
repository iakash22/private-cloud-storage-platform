#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

root_dir="${VAULTSTACK_ROOT:-/srv/vaultstack}"
secret_dir="${root_dir}/config/secrets"
force="${FORCE_REGENERATE_SECRETS:-false}"

install -d -m 0700 "${secret_dir}"

if [[ "${force}" != "true" ]] && compgen -G "${secret_dir}/*" >/dev/null; then
  for file in "${secret_dir}/database_url" "${secret_dir}/jwt_secret" "${secret_dir}/postgres_password"; do
    if [[ -s "${file}" ]]; then
      echo "Secrets already exist; set FORCE_REGENERATE_SECRETS=true only for a deliberate rotation." >&2
      exit 1
    fi
  done
fi

postgres_password="$(openssl rand -hex 24)"
jwt_secret="$(openssl rand -hex 32)"

umask 077
printf '%s\n' "${postgres_password}" > "${secret_dir}/postgres_password"
printf '%s\n' "${jwt_secret}" > "${secret_dir}/jwt_secret"
printf 'postgresql://vaultstack:%s@postgres:5432/vaultstack\n' "${postgres_password}" \
  > "${secret_dir}/database_url"

chmod 0600 "${secret_dir}/database_url" "${secret_dir}/jwt_secret" "${secret_dir}/postgres_password"
echo "Generated VaultStack Docker secrets in ${secret_dir}."
