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
  FieldError,
  PageHeader,
  Select,
} from '@vaultstack/ui';
import { RotateCcw } from 'lucide-react';
import type { PublicBackupRestoreJob, PublicBackupSnapshot } from '@vaultstack/types';
import { createBackupRestoreBodySchema, parseForm } from '@vaultstack/validation';
import { apiClient } from '../../lib/api.js';
import { useAuth } from '../../context/auth-context.js';
import { canRestoreBackups } from '../../lib/backup-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

const ACTIVE = new Set(['QUEUED', 'RUNNING', 'VERIFYING']);

export function BackupsRestorePage() {
  const { permissions } = useAuth();
  const { fieldErrors, validate, catchError } = useFormSubmit();
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
      <PageHeader
        title="Restore"
        description="Elevated restore planning. Live database restore is deferred to disaster recovery."
        icon={<RotateCcw className="h-5 w-5" aria-hidden="true" />}
        actions={
          <>
            <Button type="button" variant="outline" loadingLabel="Refreshing…" onClick={() => refresh()}>
              Refresh
            </Button>
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
          </>
        }
      />
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
              const body = validate(parseForm(createBackupRestoreBodySchema, { snapshotId }));
              if (!body) {
                return;
              }
              void apiClient
                .createBackupRestore(body)
                .then(() => {
                  setOpen(false);
                  void refresh();
                })
                .catch((caught: unknown) => {
                  catchError(caught);
                });
            }}
          />
        }
      >
        <label className="space-y-2 text-sm">
          Snapshot
          <Select
            aria-label="Snapshot"
            value={snapshotId}
            onChange={setSnapshotId}
            placeholder="Select a snapshot"
            aria-invalid={Boolean(fieldErrors.snapshotId)}
            options={[
              { value: '', label: 'Select a snapshot' },
              ...snapshots.map((snapshot) => ({ value: snapshot.id, label: snapshot.id })),
            ]}
          />
          <FieldError message={fieldErrors.snapshotId} />
        </label>
      </Dialog>
    </div>
  );
}
