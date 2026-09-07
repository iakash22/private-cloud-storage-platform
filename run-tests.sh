#!/usr/bin/env bash
set -uo pipefail
cd /home/akash22/projects/private-cloud-storage-platform
LOG=/home/akash22/projects/private-cloud-storage-platform/test-run-results.log
: > "$LOG"

echo "=== PNPM TEST ===" >> "$LOG"
pnpm test >> "$LOG" 2>&1
echo "TEST_EXIT:$?" >> "$LOG"

echo "" >> "$LOG"
echo "=== PNPM TYPECHECK ===" >> "$LOG"
pnpm --filter @vaultstack/api typecheck >> "$LOG" 2>&1
echo "TYPECHECK_EXIT:$?" >> "$LOG"

echo "" >> "$LOG"
echo "=== PNPM INTEGRATION ===" >> "$LOG"
pnpm --filter @vaultstack/api test:integration >> "$LOG" 2>&1
echo "INTEGRATION_EXIT:$?" >> "$LOG"

echo "DONE" >> "$LOG"
