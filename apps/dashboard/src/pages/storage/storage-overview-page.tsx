import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  StorageUsage,
  formatBytes,
  formatDate,
} from '@vaultstack/ui';
import { useAuth } from '../../context/auth-context.js';
import { computeUsageSummary, useBuckets } from '../../hooks/use-storage.js';
import { getFavoriteIds, getRecentFiles } from '../../lib/storage-preferences.js';

export function StorageOverviewPage() {
  const { permissions } = useAuth();
  const { buckets, loading, error, refresh } = useBuckets();
  const [usage, setUsage] = useState<{ totalBytes: number; objectCount: number; bucketCount: number }>();
  const [usageLoading, setUsageLoading] = useState(false);
  const recentFiles = getRecentFiles();
  const favoriteCount = getFavoriteIds().size;

  useEffect(() => {
    if (buckets.length === 0) {
      return;
    }

    let cancelled = false;
    setUsageLoading(true);

    void computeUsageSummary(buckets)
      .then((summary) => {
        if (!cancelled) {
          setUsage(summary);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buckets]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Storage overview</h2>
          <p className="text-sm text-slate-500">
            Organization-scoped buckets, recent activity, and usage at a glance.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {error ? (
        <EmptyState title="Unable to load storage overview" description={error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <StorageUsage summary={usage} loading={loading || usageLoading} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick stats</CardTitle>
              <CardDescription>Current organization storage footprint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{buckets.length} buckets</p>
              <p>{usage?.objectCount ?? 0} objects</p>
              <p>{favoriteCount} favorites saved locally</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permissions</CardTitle>
              <CardDescription>Effective storage capabilities for this session</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {permissions
                .filter((permission) => permission.startsWith('storage.'))
                .map((permission) => (
                  <span
                    key={permission}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                  >
                    {permission}
                  </span>
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent files</CardTitle>
          <CardDescription>Recently opened objects in this browser</CardDescription>
        </CardHeader>
        <CardContent>
          {recentFiles.length === 0 ? (
            <p className="text-sm text-slate-500">Open a file from the explorer to populate recent files.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {recentFiles.map((file) => (
                <li key={file.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{file.name}</p>
                    <p className="text-slate-500">{file.key}</p>
                  </div>
                  <span className="text-slate-500">{formatDate(file.accessedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buckets</CardTitle>
          <CardDescription>Jump into a bucket from the overview</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {buckets.length === 0 ? (
            <EmptyState
              title="No buckets yet"
              description="Create a bucket to start uploading objects."
              action={
                <Link to="/storage/buckets">
                  <Button type="button">Manage buckets</Button>
                </Link>
              }
            />
          ) : (
            buckets.slice(0, 5).map((bucket) => (
              <div key={bucket.id} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{bucket.name}</p>
                  <p className="text-xs text-slate-500">{bucket.versioning}</p>
                </div>
                <Link to={`/storage/files?bucket=${bucket.id}`}>
                  <Button type="button" variant="outline" size="sm">
                    Open
                  </Button>
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {usage ? (
        <p className="text-xs text-slate-500">
          Total storage scanned: {formatBytes(usage.totalBytes)} across {usage.objectCount} objects.
        </p>
      ) : null}
    </div>
  );
}
