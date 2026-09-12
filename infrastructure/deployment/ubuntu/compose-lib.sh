#!/usr/bin/env bash
# Shared Compose invocation for THANOS / Ubuntu host installs.
# Expects root_dir (default /srv/vaultstack) to be set by the caller.

vaultstack_compose() {
  local root="${root_dir:-${VAULTSTACK_ROOT:-/srv/vaultstack}}"
  local env_file="${root}/config/compose.env"
  local base="${root}/compose/docker-compose.yml"
  local override="${root}/compose/docker-compose.ivaultstack.yml"
  local args=(--env-file "${env_file}" -f "${base}")
  if [[ -f "${override}" ]]; then
    args+=(-f "${override}")
  fi
  docker compose "${args[@]}" "$@"
}
