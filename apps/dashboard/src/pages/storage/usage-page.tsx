import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, StorageUsage } from '@vaultstack/ui';
import { computeUsageSummary, useBuckets } from '../../hooks/use-storage.js';

export function UsagePage() {
  const { buckets, loading, error } = useBuckets();
  const [usage, setUsage] = useState<{ totalBytes: number; objectCount: number; bucketCount: number }>();
  const [usageLoading, setUsageLoading] = useState(false);

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
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Storage usage</h2>
        <p className="text-sm text-slate-500">Aggregated object counts and bytes for the active organization.</p>
      </div>

      {error ? <EmptyState title="Unable to compute usage" description={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <StorageUsage summary={usage} loading={loading || usageLoading} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage notes</CardTitle>
            <CardDescription>How this dashboard calculates usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Usage is computed by listing objects across all accessible buckets.</p>
            <p>Large organizations may require a dedicated usage API in a later phase.</p>
            <p>No internal filesystem paths or provider credentials are shown.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
