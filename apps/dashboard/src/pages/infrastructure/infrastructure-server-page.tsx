import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, formatBytes } from '@vaultstack/ui';
import type { PublicServerMetrics } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';

export function InfrastructureServerPage() {
  const [server, setServer] = useState<PublicServerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setServer(await apiClient.getInfrastructureServer());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load server metrics');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Server</h2>
          <p className="text-sm text-slate-500">CPU, RAM, load, and network from the Node collector.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error ? <EmptyState title="Unable to load server" description={error} /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CPU</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Cores: {server?.cpu.cores ?? '…'}</p>
            <p>Model: {server?.cpu.model ?? '…'}</p>
            <p>
              Load: {server ? `${server.cpu.load1.toFixed(2)} / ${server.cpu.load5.toFixed(2)} / ${server.cpu.load15.toFixed(2)}` : '…'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Memory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Used: {server ? formatBytes(server.memory.usedBytes) : '…'}</p>
            <p>Free: {server ? formatBytes(server.memory.freeBytes) : '…'}</p>
            <p>Total: {server ? formatBytes(server.memory.totalBytes) : '…'}</p>
            <p>{server ? `${server.memory.usedPercent}% used` : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Host</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{server?.hostname ?? '…'}</p>
            <p>{server?.platform ?? '…'}</p>
            <p>Uptime: {server ? `${Math.floor(server.uptimeSeconds / 3600)}h` : '…'}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Network</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {server?.network.interfaces.map((iface) => (
            <p key={iface.name}>
              {iface.name}: {iface.addresses.join(', ') || 'no address'}
              {iface.rxBytes != null ? ` · rx ${formatBytes(iface.rxBytes)}` : ''}
              {iface.txBytes != null ? ` · tx ${formatBytes(iface.txBytes)}` : ''}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
