import { formatBytes } from '../../lib/storage-utils.js';
import { Card, CardContent, CardHeader, CardTitle } from '../card.js';
import { Progress } from '../progress.js';
import { Skeleton } from '../skeleton.js';

export interface StorageUsageSummary {
  totalBytes: number;
  objectCount: number;
  bucketCount: number;
  limitBytes?: number;
}

export interface StorageUsageProps {
  summary?: StorageUsageSummary;
  loading?: boolean;
}

export function StorageUsage({ summary, loading = false }: StorageUsageProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const percent =
    summary.limitBytes && summary.limitBytes > 0
      ? Math.min(100, Math.round((summary.totalBytes / summary.limitBytes) * 100))
      : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Storage usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="text-2xl font-semibold text-slate-900">{formatBytes(summary.totalBytes)}</p>
          <p className="text-slate-500">
            {summary.objectCount.toLocaleString()} objects across {summary.bucketCount} buckets
          </p>
        </div>
        {percent !== undefined ? (
          <div className="space-y-2">
            <Progress value={percent} />
            <p className="text-xs text-slate-500">
              {percent}% of {formatBytes(summary.limitBytes ?? 0)} quota
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
