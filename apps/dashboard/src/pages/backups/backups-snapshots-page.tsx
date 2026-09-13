import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmation,
  EmptyState,
  formatBytes,
  formatDate,
  PageHeader,
} from '@vaultstack/ui';
import { Camera } from 'lucide-react';
import type { PublicBackupSnapshot } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';
import { useAuth } from '../../context/auth-context.js';
import {
  canCreateBackups,
  canDeleteBackups,
  canRestoreBackups,
} from '../../lib/backup-permissions.js';

export function BackupsSnapshotsPage() {
  const { permissions } = useAuth();
  const [snapshots, setSnapshots] = useState<PublicBackupSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshots(await apiClient.listBackupSnapshots());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load snapshots');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Snapshots"
        description="Verified archives stored through StorageService."
        icon={<Camera className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button type="button" variant="outline" loadingLabel="Refreshing…" onClick={() => refresh()}>
            Refresh
          </Button>
        }
      />
      {error ? <EmptyState title="Unable to load snapshots" description={error} /> : null}
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Snapshot list</CardTitle>
          <CardDescription>{snapshots.length} snapshots</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{snapshot.id}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(snapshot.size)} · {formatDate(snapshot.createdAt)} · checksum{' '}
                  {snapshot.manifestChecksum.slice(0, 12)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{snapshot.verificationPassed ? 'verified' : 'unverified'}</Badge>
                {canCreateBackups(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void apiClient.verifyBackupSnapshot(snapshot.id).then((result) => {
                        setMessage(result.passed ? 'Verification passed' : result.error);
                        void refresh();
                      });
                    }}
                  >
                    Verify
                  </Button>
                ) : null}
                {canRestoreBackups(permissions) ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void apiClient.createBackupRestore({ snapshotId: snapshot.id }).then(() => {
                        setMessage('Restore plan queued');
                      });
                    }}
                  >
                    Restore
                  </Button>
                ) : null}
                {canDeleteBackups(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteId(snapshot.id);
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {snapshots.length === 0 ? (
            <p className="text-sm text-slate-500">No snapshots yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <DeleteConfirmation
        open={Boolean(deleteId)}
        title="Delete snapshot"
        description="Deletes the snapshot metadata and its storage object."
        onOpenChange={(next) => {
          if (!next) {
            setDeleteId(undefined);
          }
        }}
        onConfirm={() => {
          if (!deleteId) {
            return;
          }
          void apiClient.deleteBackupSnapshot(deleteId).then(() => {
            setDeleteId(undefined);
            void refresh();
          });
        }}
      />
    </div>
  );
}
