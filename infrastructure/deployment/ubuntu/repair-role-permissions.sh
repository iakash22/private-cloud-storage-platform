#!/usr/bin/env bash
# One-shot repair for deployments that registered orgs before permission seed ran.
# Usage on THANOS:
#   sudo bash infrastructure/deployment/ubuntu/repair-role-permissions.sh
set -euo pipefail

CONTAINER="${VAULTSTACK_POSTGRES_CONTAINER:-vaultstack-postgres}"
DB_USER="${VAULTSTACK_DB_USER:-vaultstack}"
DB_NAME="${VAULTSTACK_DB_NAME:-vaultstack}"

docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
WITH keys(key, description) AS (
  VALUES
    ('storage.read', 'Read stored objects and prefixes'),
    ('storage.upload', 'Upload and overwrite stored objects'),
    ('storage.delete', 'Delete stored objects'),
    ('storage.share', 'Create and manage object shares'),
    ('artifact.read', 'Read CI artifacts'),
    ('artifact.upload', 'Upload CI artifacts'),
    ('artifact.delete', 'Delete CI artifacts'),
    ('backup.read', 'Read backup jobs and metadata'),
    ('backup.create', 'Create backup jobs'),
    ('backup.restore', 'Restore from backups'),
    ('backup.delete', 'Delete backups'),
    ('infrastructure.read', 'Read infrastructure and monitoring status'),
    ('infrastructure.manage', 'Change infrastructure settings'),
    ('users.read', 'Read users, teams, roles, and organization details'),
    ('users.manage', 'Create and manage users, teams, roles, and API keys'),
    ('audit.read', 'Read audit logs')
)
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT 'perm_' || replace(keys.key, '.', '_'), keys.key, keys.description, NOW()
FROM keys
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p.key = keys.key);

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."isSystem" = true AND r.name = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON (
  (r.name = 'VIEWER' AND p.key IN (
    'storage.read','artifact.read','backup.read','infrastructure.read','users.read','audit.read'
  ))
  OR (r.name = 'ADMIN' AND p.key IN (
    'users.read','users.manage','audit.read','infrastructure.read','storage.read','artifact.read','backup.read'
  ))
  OR (r.name = 'STORAGE_ADMIN' AND p.key IN (
    'storage.read','storage.upload','storage.delete','storage.share','artifact.read'
  ))
  OR (r.name = 'BACKUP_ADMIN' AND p.key IN (
    'backup.read','backup.create','backup.restore','backup.delete'
  ))
  OR (r.name = 'DEVELOPER' AND p.key IN (
    'storage.read','storage.upload','storage.share','artifact.read','artifact.upload','artifact.delete','backup.read'
  ))
)
WHERE r."isSystem" = true
ON CONFLICT DO NOTHING;

SELECT count(*) AS permissions FROM "Permission";
SELECT r.name, count(rp."permissionId") AS perms
FROM "Role" r
LEFT JOIN "RolePermission" rp ON rp."roleId" = r.id
WHERE r."isSystem"
GROUP BY r.name
ORDER BY r.name;
SQL

echo "Role permissions repaired. Hard-refresh the dashboard (or log out/in)."
