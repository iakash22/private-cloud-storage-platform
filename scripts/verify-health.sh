#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"

echo "Checking ${API_URL}/health"
curl -fsS "${API_URL}/health" | jq .

echo "Checking ${API_URL}/ready"
curl -fsS "${API_URL}/ready" | jq .
