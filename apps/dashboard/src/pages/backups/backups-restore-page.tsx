import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogActions,
  EmptyState,
} from '@vaultstack/ui';
import type { PublicBackupRestoreJob, PublicBackupSnapshot } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';
import { useAuth } from '../../context/auth-context.js';
import { canRestoreBackups } from '../../lib/backup-permissions.js';

const ACTIVE = new Set(['QUEUED', 'RUNNING', 'VERIFYING']);

export function BackupsRestorePage() {
  const { permissions } = useAuth();
  const [restores, setRestores] = useState<PublicBackupRestoreJob[]>([]);
  const [snapshots, setSnapshots] = useState<PublicBackupSnapshot[]>([]);
  const [open, setOpen] = useState(false);
  const [snapshotId, setSnapshotId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [nextRestores, nextSnapshots] = await Promise.all([
        apiClient.listBackupRestoreJobs(),
        apiClient.listBackupSnapshots(),
      ]);
      setRestores(nextRestores);
      setSnapshots(nextSnapshots);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load restore jobs');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = restores.find((job) => job.id === selectedId) ?? restores[0];

  useEffect(() => {
    if (!selected || !ACTIVE.has(selected.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void apiClient.getBackupRestore(selected.id).then((job) => {
        setRestores((current) => current.map((row) => (row.id === job.id ? job : row)));
      });
    }, 2000);
    return () => {
      window.clearInterval(timer);
    };
  }, [selected]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Restore</h2>
          <p className="text-sm text-slate-500">
            Elevated restore planning. Live database restore is deferred to disaster recovery.
          </p>
        </div>
        {canRestoreBackups(permissions) ? (
          <Button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Start restore
          </Button>
        ) : (
          <p className="text-sm text-slate-500">backup.restore permission is required.</p>
        )}
      </div>
      {error ? <EmptyState title="Unable to load restore jobs" description={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restore jobs</CardTitle>
            <CardDescription>{restores.length} jobs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {restores.map((job) => (
              <button
                key={job.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                onClick={() => {
                  setSelectedId(job.id);
                }}
              >
                <div>
                  <p className="font-medium text-slate-900">{job.snapshotId}</p>
                  <p className="text-xs text-slate-500">{job.currentStep ?? 'queued'}</p>
                </div>
                <Badge>{job.status}</Badge>
              </button>
            ))}
            {restores.length === 0 ? (
              <p className="text-sm text-slate-500">No restore jobs yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restore plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selected?.restorePlan ? (
              <>
                <p>Destructive: {selected.restorePlan.destructive ? 'yes' : 'no'}</p>
                <ul className="list-disc pl-5">
                  {selected.restorePlan.components.map((component) => (
                    <li key={component.path}>{component.path}</li>
                  ))}
                </ul>
                {selected.restorePlan.warnings.map((warning) => (
                  <p key={warning} className="text-slate-500">
                    {warning}
                  </p>
                ))}
              </>
            ) : (
              <p>Select a completed restore job to inspect its plan.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Start restore"
        description="Creates a restore-plan job. It does not overwrite live data."
        footer={
          <DialogActions
            confirmLabel="Restore"
            confirmDisabled={!snapshotId}
            onCancel={() => {
              setOpen(false);
            }}
            onConfirm={() => {
              void apiClient.createBackupRestore({ snapshotId }).then(() => {
                setOpen(false);
                void refresh();
              });
            }}
          />
        }
      >
        <label className="space-y-2 text-sm">
          Snapshot
          <select
            aria-label="Snapshot"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={snapshotId}
            onChange={(event) => {
              setSnapshotId(event.target.value);
            }}
          >
            <option value="">Select a snapshot</option>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.id}
              </option>
            ))}
          </select>
        </label>
      </Dialog>
    </div>
  );
}
