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
  MetricCardsSkeleton,
  PageHeader,
  StorageUsage,
  formatBytes,
  formatDate,
} from '@vaultstack/ui';
import {
  ArrowRight,
  Database,
  FileStack,
  HardDrive,
  Share2,
  Star,
  Timer,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context.js';
import { computeUsageSummary, useBuckets } from '../../hooks/use-storage.js';
import { getFavoriteIds, getRecentFiles } from '../../lib/storage-preferences.js';

const QUICK_LINKS = [
  { to: '/storage/files', label: 'Browse files', icon: FileStack },
  { to: '/storage/buckets', label: 'Manage buckets', icon: Database },
  { to: '/storage/shares', label: 'Shares', icon: Share2 },
  { to: '/storage/policies', label: 'Policies', icon: Timer },
] as const;

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
      <PageHeader
        title="Storage overview"
        description="Organization-scoped buckets, recent activity, and usage at a glance."
        icon={<HardDrive className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button
            type="button"
            variant="outline"
            loading={loading}
            loadingLabel="Refreshing…"
            onClick={() => refresh()}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-800">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {item.label}
            </span>
            <ArrowRight
              className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>

      {error ? (
        <EmptyState title="Unable to load storage overview" description={error} />
      ) : loading && buckets.length === 0 ? (
        <MetricCardsSkeleton count={3} className="xl:grid-cols-3" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <StorageUsage summary={usage} loading={loading || usageLoading} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick stats</CardTitle>
              <CardDescription>Current organization storage footprint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <span className="text-slate-500">Buckets</span>
                <span className="font-semibold text-slate-900">{buckets.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <span className="text-slate-500">Objects</span>
                <span className="font-semibold text-slate-900">{usage?.objectCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  Favorites
                </span>
                <span className="font-semibold text-slate-900">{favoriteCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permissions</CardTitle>
              <CardDescription>Effective storage capabilities for this session</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {permissions.filter((permission) => permission.startsWith('storage.')).length === 0 ? (
                <p className="text-sm text-slate-500">No storage permissions on this session.</p>
              ) : (
                permissions
                  .filter((permission) => permission.startsWith('storage.'))
                  .map((permission) => (
                    <span
                      key={permission}
                      className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {permission}
                    </span>
                  ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-h-[16rem]">
          <CardHeader>
            <CardTitle className="text-base">Recent files</CardTitle>
            <CardDescription>Recently opened objects in this browser</CardDescription>
          </CardHeader>
          <CardContent>
            {recentFiles.length === 0 ? (
              <p className="text-sm text-slate-500">
                Open a file from the explorer to populate recent files.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentFiles.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{file.name}</p>
                      <p className="truncate text-slate-500">{file.key}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {formatDate(file.accessedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[16rem]">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Buckets</CardTitle>
              <CardDescription>Jump into a bucket from the overview</CardDescription>
            </div>
            <Link to="/storage/buckets">
              <Button type="button" variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
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
                <div
                  key={bucket.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{bucket.name}</p>
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
      </div>

      {usage ? (
        <p className="text-xs text-slate-500">
          Total storage scanned: {formatBytes(usage.totalBytes)} across {usage.objectCount} objects.
        </p>
      ) : null}
    </div>
  );
}
