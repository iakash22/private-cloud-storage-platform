import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@vaultstack/ui';
import type { PublicInfrastructureSummary } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';

export function InfrastructureOverviewPage() {
  const [summary, setSummary] = useState<PublicInfrastructureSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSummary(await apiClient.getInfrastructureSummary());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load infrastructure');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Infrastructure overview</h2>
          <p className="text-sm text-slate-500">
            Controlled collectors for host, disk, storage, and Docker. No shell access.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {error ? <EmptyState title="Unable to load infrastructure" description={error} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Server</CardTitle>
            <CardDescription>CPU and memory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Status: {summary?.server.status ?? '…'}</p>
            <p>CPU cores: {summary?.server.cpuCores ?? '…'}</p>
            <p>Memory used: {summary ? `${summary.server.memoryUsedPercent}%` : '…'}</p>
            <Link className="text-sm font-medium underline" to="/infrastructure/server">
              Server details
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disks</CardTitle>
            <CardDescription>Physical and storage-root usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Status: {summary?.disks.status ?? '…'}</p>
            <p>Volumes: {summary?.disks.volumeCount ?? '…'}</p>
            <Link className="text-sm font-medium underline" to="/infrastructure/disks">
              Disk details
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage</CardTitle>
            <CardDescription>Objects, bytes, providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Objects: {summary?.storage.objectCount ?? '…'}</p>
            <p>Unhealthy providers: {summary?.storage.unhealthyProviders ?? '…'}</p>
            <Link className="text-sm font-medium underline" to="/infrastructure/storage">
              Storage details
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Docker</CardTitle>
            <CardDescription>Engine socket collector</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{summary?.docker.available ? 'Available' : 'Unavailable'}</p>
            <p>Running: {summary?.docker.containersRunning ?? '—'}</p>
            <Link className="text-sm font-medium underline" to="/infrastructure/docker">
              Docker details
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
