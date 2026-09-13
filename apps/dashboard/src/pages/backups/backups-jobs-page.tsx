import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Progress,
} from '@vaultstack/ui';
import { ListTodo } from 'lucide-react';
import type { PublicBackupJob, PublicBackupJobLog } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';
import { useRealtimeSubscription } from '../../hooks/use-realtime-subscription.js';
import { useAuth } from '../../context/auth-context.js';
import { canCreateBackups } from '../../lib/backup-permissions.js';

const ACTIVE = new Set(['QUEUED', 'RUNNING', 'VERIFYING']);

export function BackupsJobsPage() {
  const { permissions } = useAuth();
  const [jobs, setJobs] = useState<PublicBackupJob[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [logs, setLogs] = useState<PublicBackupJobLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiClient.listBackupJobs();
      setJobs(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load jobs');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  const refreshSelectedJob = useCallback(async () => {
    if (!selected) {
      return;
    }
    const job = await apiClient.getBackupJob(selected.id);
    setJobs((current) => current.map((row) => (row.id === job.id ? job : row)));
  }, [selected]);

  useRealtimeSubscription(
    ['backup_job.progress', 'backup_job.completed', 'backup_job.failed'],
    (event) => {
      const payload = event.payload as { jobId?: string };
      if (!selected || payload.jobId !== selected.id) {
        return;
      }
      void refreshSelectedJob().catch(() => undefined);
    },
  );

  useEffect(() => {
    if (!selected || !ACTIVE.has(selected.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshSelectedJob().catch(() => undefined);
    }, 15_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshSelectedJob, selected]);

  useEffect(() => {
    if (!selected) {
      setLogs([]);
      return;
    }
    void apiClient
      .listBackupJobLogs(selected.id)
      .then((next) => {
        setLogs(next);
      })
      .catch(() => {
        setLogs([]);
      });
  }, [selected]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup jobs"
        description="Progress, logs, retry, and cancel."
        icon={<ListTodo className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button type="button" variant="outline" loadingLabel="Refreshing…" onClick={() => refresh()}>
            Refresh
          </Button>
        }
      />
      {error ? <EmptyState title="Unable to load jobs" description={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs</CardTitle>
            <CardDescription>{jobs.length} jobs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                onClick={() => {
                  setSelectedId(job.id);
                }}
              >
                <div>
                  <p className="font-medium text-slate-900">{job.targets.join(', ')}</p>
                  <p className="text-xs text-slate-500">{job.currentStep ?? 'queued'}</p>
                </div>
                <Badge>{job.status}</Badge>
              </button>
            ))}
            {jobs.length === 0 ? (
              <p className="text-sm text-slate-500">No backup jobs yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job details</CardTitle>
            <CardDescription>{selected ? selected.id : 'Select a job'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selected ? (
              <>
                <Progress value={selected.progressPercent} />
                <p>Status: {selected.status}</p>
                <p>Progress: {selected.progressPercent}%</p>
                {selected.errorMessage ? (
                  <p className="text-red-600">{selected.errorMessage}</p>
                ) : null}
                {canCreateBackups(permissions) && ACTIVE.has(selected.status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void apiClient.cancelBackupJob(selected.id).then(() => refresh())
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
                {canCreateBackups(permissions) && selected.status === 'FAILED' ? (
                  <Button
                    type="button"
                    onClick={() => void apiClient.retryBackupJob(selected.id).then(() => refresh())}
                  >
                    Retry
                  </Button>
                ) : null}
                <div className="max-h-64 overflow-auto rounded-md border border-slate-200 p-2">
                  {logs.map((log) => (
                    <p key={log.id} className="font-mono text-xs">
                      [{log.level}] {log.message}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p>Select a job to inspect progress and logs.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
