#!/usr/bin/env bash
# Test: storage bucket upload via initiate → PUT → complete (presign/token URL)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/env.local.sh" ]] && source "$ROOT/env.local.sh"
: "${VS_API:?set VS_API}"
: "${VS_KEY:?set VS_KEY}"

AUTH=(-H "Authorization: Bearer $VS_KEY" -H "Content-Type: application/json")
BUCKET_NAME="${VS_BUCKET_NAME:-usage-smoke-$(date +%s)}"
TMP="$(mktemp)"
echo "vaultstack usage smoke $(date -Iseconds)" >"$TMP"
SIZE=$(wc -c <"$TMP" | tr -d ' ')

echo "== list/create bucket: $BUCKET_NAME =="
BUCKETS_JSON=$(curl -sS "$VS_API/api/v1/storage/buckets" "${AUTH[@]}")
EXISTING=$(echo "$BUCKETS_JSON" | jq -r --arg n "$BUCKET_NAME" '.buckets[]? | select(.name==$n) | .id' | head -n1 || true)

if [[ -z "${EXISTING:-}" || "$EXISTING" == "null" ]]; then
  CREATE=$(curl -sS -X POST "$VS_API/api/v1/storage/buckets" "${AUTH[@]}" \
    -d "{\"name\":\"$BUCKET_NAME\"}")
  BUCKET_ID=$(echo "$CREATE" | jq -r '.bucket.id')
else
  BUCKET_ID="$EXISTING"
fi
echo "bucketId=$BUCKET_ID"

KEY="smoke/$(basename "$TMP").txt"
echo "== initiate upload key=$KEY size=$SIZE =="
INIT=$(curl -sS -X POST "$VS_API/api/v1/storage/uploads/initiate" "${AUTH[@]}" \
  -d "{\"bucketId\":\"$BUCKET_ID\",\"key\":\"$KEY\",\"contentType\":\"text/plain\",\"size\":$SIZE}")
UPLOAD_ID=$(echo "$INIT" | jq -r '.upload.id')
UPLOAD_URL=$(echo "$INIT" | jq -r '.uploadUrl')
echo "uploadId=$UPLOAD_ID"

echo "== PUT bytes =="
curl -sS -X PUT "$UPLOAD_URL" -H "Content-Type: text/plain" --data-binary @"$TMP" >/dev/null

echo "== complete =="
OBJ=$(curl -sS -X POST "$VS_API/api/v1/storage/uploads/$UPLOAD_ID/complete" "${AUTH[@]}" -d '{}')
OBJECT_ID=$(echo "$OBJ" | jq -r '.object.id')
echo "objectId=$OBJECT_ID"

echo "== download-url =="
curl -sS -X POST "$VS_API/api/v1/storage/objects/$OBJECT_ID/download-url" "${AUTH[@]}" \
  -d '{}' | jq '{ method: .download.method, expiresAt: .download.expiresAt, url: .download.url }'

rm -f "$TMP"
echo "OK"
