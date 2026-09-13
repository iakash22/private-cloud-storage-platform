import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, formatBytes, PageHeader } from '@vaultstack/ui';
import { Disc3 } from 'lucide-react';
import type { PublicDiskMetrics } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';

export function InfrastructureDisksPage() {
  const [disks, setDisks] = useState<PublicDiskMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDisks(await apiClient.getInfrastructureDisks());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load disks');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disks"
        description="Physical filesystems and the storage root via statfs."
        icon={<Disc3 className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button type="button" variant="outline" loadingLabel="Refreshing…" onClick={() => refresh()}>
            Refresh
          </Button>
        }
      />
      {error ? <EmptyState title="Unable to load disks" description={error} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volumes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {disks?.volumes.map((volume) => (
            <div key={`${volume.kind}:${volume.path}`} className="rounded-md border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{volume.path}</p>
                <Badge>{volume.status}</Badge>
              </div>
              <p className="text-xs text-slate-500">{volume.kind.replace('_', ' ')}</p>
              {volume.status === 'ok' ? (
                <p className="mt-1 text-sm text-slate-600">
                  {formatBytes(volume.usedBytes ?? 0)} used · {formatBytes(volume.freeBytes ?? 0)} free ·{' '}
                  {formatBytes(volume.totalBytes ?? 0)} total ({volume.usedPercent}%)
                </p>
              ) : (
                <p className="mt-1 text-sm text-red-600">{volume.error}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
