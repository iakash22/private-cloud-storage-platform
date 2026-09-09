#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ref="${1:?Usage: rollback.sh <known-good-git-ref> /path/to/vaultstack-repo}"
source_repo="${2:?Usage: rollback.sh <known-good-git-ref> /path/to/vaultstack-repo}"

echo "Rolling VaultStack back to ${ref}; a backup will be created first."
exec bash "${script_dir}/upgrade.sh" "${source_repo}" "${ref}"
