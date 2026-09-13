import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  formatBytes,
  PageHeader,
} from '@vaultstack/ui';
import { Cpu } from 'lucide-react';
import type { PublicServerMetrics } from '@vaultstack/types';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../../lib/api.js';

export function InfrastructureServerPage() {
  const [server, setServer] = useState<PublicServerMetrics | null>(null);
  const [history, setHistory] = useState<ServerPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiClient.getInfrastructureServer();
      setServer(next);
      setHistory((current) =>
        current
          .concat({
            time: new Date(next.collectedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            load: next.cpu.load1,
            memory: next.memory.usedPercent,
          })
          .slice(-30),
      );
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
      <PageHeader
        title="Server"
        description="CPU, RAM, load, and network from the Node collector."
        icon={<Cpu className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button
            type="button"
            variant="outline"
            loadingLabel="Refreshing…"
            onClick={() => refresh()}
          >
            Refresh
          </Button>
        }
      />
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
              Load:{' '}
              {server
                ? `${server.cpu.load1.toFixed(2)} / ${server.cpu.load5.toFixed(2)} / ${server.cpu.load15.toFixed(2)}`
                : '…'}
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Server trend</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length < 2 ? (
            <p className="text-sm text-slate-500">Collecting monitoring samples…</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" minTickGap={32} />
                  <YAxis width={42} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="load"
                    name="Load 1m"
                    stroke="#2563eb"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="memory"
                    name="Memory %"
                    stroke="#16a34a"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ServerPoint {
  time: string;
  load: number;
  memory: number;
}
