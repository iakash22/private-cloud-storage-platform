import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from '@vaultstack/ui';
import { Archive } from 'lucide-react';
import type { PublicBackupSummary } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';
import { useAuth } from '../../context/auth-context.js';
import { canCreateBackups } from '../../lib/backup-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function BackupsOverviewPage() {
  const { permissions } = useAuth();
  const { catchError } = useFormSubmit();
  const [summary, setSummary] = useState<PublicBackupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSummary(await apiClient.getBackupSummary());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load backup summary');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createBackup = async () => {
    setCreating(true);
    try {
      await apiClient.createBackupJob({
        targets: ['VAULTSTACK_METADATA', 'VAULTSTACK_OBJECT_METADATA'],
      });
      await refresh();
    } catch (caught) {
      catchError(caught);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup overview"
        description="Job status, snapshots, and retention at a glance."
        icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        actions={
          <>
            <Button type="button" variant="outline" loadingLabel="Refreshing…" onClick={() => refresh()}>
              Refresh
            </Button>
            {canCreateBackups(permissions) ? (
              <Button type="button" onClick={() => void createBackup()} disabled={creating}>
                Create backup
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <EmptyState title="Unable to load backups" description={error} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshots</CardTitle>
            <CardDescription>Verified backup archives</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.snapshotCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedules</CardTitle>
            <CardDescription>Recurring backup policies</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.scheduleCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restore jobs</CardTitle>
            <CardDescription>Plan-only restore foundation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.restoreCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          {summary ? (
            Object.entries(summary.jobCounts).map(([status, count]) => (
              <p key={status}>
                {status}: {count}
              </p>
            ))
          ) : (
            <p>Loading…</p>
          )}
        </CardContent>
      </Card>

      {summary?.latestJob ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest job</CardTitle>
            <CardDescription>{summary.latestJob.status}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link className="text-sm font-medium text-slate-900 underline" to="/backups/jobs">
              View jobs
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
