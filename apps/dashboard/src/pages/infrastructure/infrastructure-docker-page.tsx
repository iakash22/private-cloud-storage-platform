import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@vaultstack/ui';
import type { PublicDockerMetrics } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';

export function InfrastructureDockerPage() {
  const [docker, setDocker] = useState<PublicDockerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocker(await apiClient.getInfrastructureDocker());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Docker metrics');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Docker</h2>
          <p className="text-sm text-slate-500">
            Read-only Docker Engine API over the configured socket. No command execution.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error ? <EmptyState title="Unable to load Docker" description={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Status: <Badge>{docker?.available ? 'available' : 'unavailable'}</Badge>
          </p>
          <p>{docker?.message}</p>
          <p>Version: {docker?.serverVersion ?? '—'}</p>
          <p>Containers: {docker?.containers ?? '—'} ({docker?.containersRunning ?? '—'} running)</p>
          <p>Images: {docker?.images ?? '—'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Containers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {docker?.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {item.image} · {item.status}
                </p>
              </div>
              <Badge>{item.state}</Badge>
            </div>
          ))}
          {docker?.items.length === 0 ? (
            <p className="text-slate-500">
              {docker.available ? 'No running containers.' : 'Docker collector could not connect.'}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
