import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  formatBytes,
  PageHeader,
  StorageUsage,
} from '@vaultstack/ui';
import { BookOpen } from 'lucide-react';
import type { PublicStorageMonitorMetrics } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';
import { computeUsageSummary, useBuckets } from '../../hooks/use-storage.js';

export function UsagePage() {
  const { buckets } = useBuckets();
  const [metrics, setMetrics] = useState<PublicStorageMonitorMetrics>();
  const [fallback, setFallback] = useState<{
    totalBytes: number;
    objectCount: number;
    bucketCount: number;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMetrics(await apiClient.getInfrastructureStorage());
      setFallback(undefined);
      setError(null);
    } catch {
      try {
        const summary = await computeUsageSummary(buckets);
        setMetrics(undefined);
        setFallback(summary);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load usage');
      }
    } finally {
      setLoading(false);
    }
  }, [buckets]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = metrics
    ? {
        totalBytes: metrics.totalBytes,
        objectCount: metrics.objectCount,
        bucketCount: metrics.bucketCount,
        limitBytes: metrics.storageRoot.totalBytes ?? undefined,
      }
    : fallback;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage usage"
        description="Organization capacity from the storage collector, with object listing as a fallback."
        icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
      />

      {error ? <EmptyState title="Unable to load usage" description={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <StorageUsage summary={summary} loading={loading} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Buckets</CardTitle>
            <CardDescription>
              {metrics
                ? `${metrics.uploadsLast24h} uploads in the last 24 hours`
                : fallback
                  ? 'Estimated from object listings'
                  : 'Loading…'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(metrics?.buckets ?? []).map((bucket) => (
              <div key={bucket.bucketId} className="flex justify-between gap-3">
                <span className="font-medium text-slate-900">{bucket.name}</span>
                <span className="text-slate-500">
                  {bucket.objectCount} objects · {formatBytes(bucket.bytes)}
                </span>
              </div>
            ))}
            {!metrics && fallback ? (
              <p className="text-slate-500">
                {fallback.objectCount} objects across {fallback.bucketCount} buckets.
              </p>
            ) : null}
            {metrics?.buckets.length === 0 ? (
              <p className="text-slate-500">No bucket usage recorded yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
