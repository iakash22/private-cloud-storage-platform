import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from '@vaultstack/ui';
import { Server } from 'lucide-react';
import type { PublicInfrastructureSummary } from '@vaultstack/types';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../../lib/api.js';

export function InfrastructureOverviewPage() {
  const [summary, setSummary] = useState<PublicInfrastructureSummary | null>(null);
  const [history, setHistory] = useState<InfrastructurePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiClient.getInfrastructureSummary();
      setSummary(next);
      setHistory((current) => [
        ...current
          .concat({
            time: new Date(next.collectedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            memory: next.server.memoryUsedPercent,
            objects: next.storage.objectCount,
            storage: next.storage.totalBytes,
          })
          .slice(-30),
      ]);
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
      <PageHeader
        title="Infrastructure overview"
        description="Controlled collectors for host, disk, storage, and Docker. No shell access."
        icon={<Server className="h-5 w-5" aria-hidden="true" />}
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live infrastructure trend</CardTitle>
          <CardDescription>
            Collected from the API every 10 seconds · last 30 samples
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length < 2 ? (
            <p className="text-sm text-slate-500">Collecting monitoring samples…</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" minTickGap={32} />
                  <YAxis unit="%" width={42} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="memory"
                    name="Memory used"
                    stroke="#2563eb"
                    fill="url(#memoryFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface InfrastructurePoint {
  time: string;
  memory: number;
  objects: number;
  storage: number;
}
