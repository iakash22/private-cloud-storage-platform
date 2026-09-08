#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

compose=(compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml)

if docker info >/dev/null 2>&1; then
  exec docker "${compose[@]}" "$@"
fi

if command -v docker.exe >/dev/null 2>&1 && docker.exe info >/dev/null 2>&1; then
  exec docker.exe "${compose[@]}" "$@"
fi

echo "Docker is not available. Start Docker Desktop and enable WSL integration for this distro." >&2
echo "See https://docs.docker.com/desktop/wsl/" >&2
exit 1
