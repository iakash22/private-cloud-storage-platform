#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

ssh_port="${SSH_PORT:-22}"
allow_public_ssh="${ALLOW_PUBLIC_SSH:-false}"

apt-get update
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp comment 'VaultStack TLS HTTP redirect and ACME'
ufw allow 443/tcp comment 'VaultStack HTTPS'

if [[ "${allow_public_ssh}" == "true" ]]; then
  ufw allow "${ssh_port}/tcp" comment 'Administrative SSH'
elif ip link show tailscale0 >/dev/null 2>&1; then
  ufw allow in on tailscale0 to any port "${ssh_port}" proto tcp comment 'SSH over Tailscale'
else
  echo "tailscale0 is missing; refusing to enable UFW without public SSH." >&2
  echo "Install/authenticate Tailscale first or set ALLOW_PUBLIC_SSH=true." >&2
  exit 1
fi

# These services intentionally have no allow rule and remain private.
ufw delete allow 5432/tcp >/dev/null 2>&1 || true
ufw delete allow 6379/tcp >/dev/null 2>&1 || true
ufw --force enable
ufw status verbose
