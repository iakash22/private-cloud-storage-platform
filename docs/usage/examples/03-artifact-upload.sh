#!/usr/bin/env bash
# Test: artifact project upload (Opsiva-style) initiate → PUT → complete
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/env.local.sh" ]] && source "$ROOT/env.local.sh"
: "${VS_API:?set VS_API}"
: "${VS_KEY:?set VS_KEY}"

AUTH=(-H "Authorization: Bearer $VS_KEY" -H "Content-Type: application/json")
TMP="$(mktemp)"
echo "artifact smoke $(date -Iseconds)" >"$TMP"
SIZE=$(wc -c <"$TMP" | tr -d ' ')
FILE_NAME="smoke.txt"

if [[ -z "${VS_PROJECT_ID:-}" ]]; then
  echo "== create project =="
  PROJ=$(curl -sS -X POST "$VS_API/api/v1/artifacts/projects" "${AUTH[@]}" \
    -d "{\"name\":\"usage-smoke\",\"slug\":\"usage-smoke-$(date +%s)\"}")
  VS_PROJECT_ID=$(echo "$PROJ" | jq -r '.project.id')
fi
echo "projectId=$VS_PROJECT_ID"

if [[ -z "${VS_BUILD_ID:-}" ]]; then
  echo "== create build =="
  BUILD=$(curl -sS -X POST "$VS_API/api/v1/artifacts/projects/$VS_PROJECT_ID/builds" "${AUTH[@]}" \
    -d '{"title":"usage-smoke"}')
  VS_BUILD_ID=$(echo "$BUILD" | jq -r '.build.id')
fi
echo "buildId=$VS_BUILD_ID"

echo "== initiate artifact =="
INIT=$(curl -sS -X POST \
  "$VS_API/api/v1/artifacts/projects/$VS_PROJECT_ID/builds/$VS_BUILD_ID/artifacts" \
  "${AUTH[@]}" \
  -d "{\"name\":\"$FILE_NAME\",\"fileName\":\"$FILE_NAME\",\"contentType\":\"text/plain\",\"size\":$SIZE,\"kind\":\"GENERIC\"}")

UPLOAD_URL=$(echo "$INIT" | jq -r '.uploadUrl')
VERSION_ID=$(echo "$INIT" | jq -r '.version.id')
echo "versionId=$VERSION_ID"

echo "== PUT bytes =="
curl -sS -X PUT "$UPLOAD_URL" -H "Content-Type: text/plain" --data-binary @"$TMP" >/dev/null

echo "== complete =="
curl -sS -X POST "$VS_API/api/v1/artifacts/versions/$VERSION_ID/complete" "${AUTH[@]}" -d '{}' \
  | jq '{ status: .version.status, id: .version.id }'

echo "== download-url =="
curl -sS -X POST "$VS_API/api/v1/artifacts/versions/$VERSION_ID/download-url" \
  -H "Authorization: Bearer $VS_KEY" -H "Content-Type: application/json" -d '{}' \
  | jq '{ method: .download.method, url: .download.url }'

rm -f "$TMP"
echo "OK — reuse with:"
echo "  export VS_PROJECT_ID=$VS_PROJECT_ID"
echo "  export VS_BUILD_ID=$VS_BUILD_ID"
