#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  chmod +x scripts/init-env.sh
  ./scripts/init-env.sh
else
  echo "Using existing .env (run ./scripts/init-env.sh to regenerate)"
fi

pnpm install
pnpm docker:up
pnpm db:migrate
pnpm db:seed

echo "VaultStack development infrastructure is ready."
echo "Run 'pnpm build' then 'pnpm dev' to start the API and dashboard."
