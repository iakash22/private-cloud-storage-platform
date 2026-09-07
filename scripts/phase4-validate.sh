#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
pnpm install
pnpm lint
pnpm typecheck
pnpm test
