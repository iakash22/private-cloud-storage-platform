import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, formatBytes, PageHeader } from '@vaultstack/ui';
import { Database } from 'lucide-react';
import type { PublicStorageMonitorMetrics } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';

export function InfrastructureStoragePage() {
  const [storage, setStorage] = useState<PublicStorageMonitorMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStorage(await apiClient.getInfrastructureStorage());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load storage metrics');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage"
        description="Bucket usage, object counts, upload activity, and provider health."
        icon={<Database className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button type="button" variant="outline" loadingLabel="Refreshing…" onClick={() => refresh()}>
            Refresh
          </Button>
        }
      />
      {error ? <EmptyState title="Unable to load storage" description={error} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{storage ? formatBytes(storage.totalBytes) : '…'} in {storage?.objectCount ?? '…'} objects</p>
            <p>{storage?.bucketCount ?? '…'} buckets</p>
            <p>Uploads (24h): {storage?.uploadsLast24h ?? '…'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage root</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{storage?.storageRoot.path}</p>
            {storage?.storageRoot.status === 'ok' ? (
              <p>
                {formatBytes(storage.storageRoot.freeBytes ?? 0)} free of{' '}
                {formatBytes(storage.storageRoot.totalBytes ?? 0)}
              </p>
            ) : (
              <p className="text-red-600">{storage?.storageRoot.error ?? 'Unavailable'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Process uploads</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{storage?.processUploads ?? 0} completed</p>
            <p>{formatBytes(storage?.processBytesUploaded ?? 0)} uploaded</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buckets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {storage?.buckets.map((bucket) => (
            <p key={bucket.bucketId}>
              {bucket.name}: {bucket.objectCount} objects · {formatBytes(bucket.bytes)}
            </p>
          ))}
          {storage?.buckets.length === 0 ? <p className="text-slate-500">No buckets yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Providers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {storage?.providers.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{provider.name}</p>
                <p className="text-xs text-slate-500">
                  {provider.type} · {provider.message}
                </p>
              </div>
              <Badge>{provider.healthy ? 'healthy' : 'unavailable'}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
