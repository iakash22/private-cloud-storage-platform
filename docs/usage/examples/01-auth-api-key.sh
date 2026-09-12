#!/usr/bin/env bash
# Test: API key can call /api/v1/auth/me
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/env.local.sh" ]] && source "$ROOT/env.local.sh"
: "${VS_API:?set VS_API}"
: "${VS_KEY:?set VS_KEY}"

echo "== GET $VS_API/api/v1/auth/me =="
curl -sS "$VS_API/api/v1/auth/me" \
  -H "Authorization: Bearer $VS_KEY" | jq '{
    id: .user.id,
    email: .user.email,
    organizations: [.organizations[]?.id],
    activeOrganizationId
  }'

echo "OK"
