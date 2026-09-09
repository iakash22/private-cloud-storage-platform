import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  formatBytes,
} from '@vaultstack/ui';
import type {
  PublicAuditLog,
  PublicBackupSummary,
  PublicProject,
  PublicStorageMonitorMetrics,
  PublicStorageProvider,
  PublicBucket,
  PublicInfrastructureSummary,
} from '@vaultstack/types';
import { useAuth } from '../context/auth-context.js';
import { computeUsageSummary } from '../hooks/use-storage.js';
import { apiClient } from '../lib/api.js';
import { canReadBackups } from '../lib/backup-permissions.js';
import { canReadActivity, canReadArtifacts } from '../lib/dashboard-permissions.js';
import { canReadInfrastructure } from '../lib/infrastructure-permissions.js';
import { canReadStorage } from '../lib/storage-preferences.js';

interface DashboardData {
  buckets?: PublicBucket[];
  providers?: PublicStorageProvider[];
  storage?: PublicStorageMonitorMetrics;
  infrastructure?: PublicInfrastructureSummary;
  backup?: PublicBackupSummary;
  projects?: PublicProject[];
  activity?: PublicAuditLog[];
  storageUsage?: { totalBytes: number; objectCount: number; bucketCount: number };
}

interface MetricCardProps {
  label: string;
  value: string;
  description: string;
  href?: string;
}

export function DashboardPage() {
  const { activeOrganizationId, permissions } = useAuth();
  const [data, setData] = useState<DashboardData>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextErrors: string[] = [];
    const canStorage = canReadStorage(permissions);
    const canInfrastructure = canReadInfrastructure(permissions);
    const canBackups = canReadBackups(permissions);
    const canArtifacts = canReadArtifacts(permissions);
    const canActivity = canReadActivity(permissions);

    const safe = async <T,>(label: string, request: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await request();
      } catch (caught) {
        nextErrors.push(`${label}: ${caught instanceof Error ? caught.message : 'unavailable'}`);
        return undefined;
      }
    };

    const [buckets, providers, storage, infrastructure, backup, projects, activity] =
      await Promise.all([
        canStorage ? safe('Storage buckets', () => apiClient.listBuckets()) : undefined,
        canStorage ? safe('Storage providers', () => apiClient.listStorageProviders()) : undefined,
        canInfrastructure
          ? safe('Storage metrics', () => apiClient.getInfrastructureStorage())
          : undefined,
        canInfrastructure
          ? safe('Infrastructure health', () => apiClient.getInfrastructureSummary())
          : undefined,
        canBackups ? safe('Backups', () => apiClient.getBackupSummary()) : undefined,
        canArtifacts ? safe('Artifacts', () => apiClient.listProjects()) : undefined,
        canActivity ? safe('API activity', () => apiClient.listAuditLogs({ limit: 8 })) : undefined,
      ]);

    let logicalUsage: { totalBytes: number; objectCount: number; bucketCount: number } | undefined;
    if (canStorage && !storage && buckets) {
      logicalUsage = await safe('Logical storage usage', () => computeUsageSummary(buckets));
    }

    setData({
      buckets,
      providers,
      storage,
      infrastructure,
      backup,
      projects,
      activity,
      ...(logicalUsage ? { storageUsage: logicalUsage } : {}),
    });
    setErrors(nextErrors);
    setLoading(false);
  }, [permissions]);

  useEffect(() => {
    if (activeOrganizationId) {
      void refresh();
    }
  }, [activeOrganizationId, refresh]);

  const logicalBytes = data.storage?.totalBytes ?? data.storageUsage?.totalBytes;
  const objectCount = data.storage?.objectCount ?? data.storageUsage?.objectCount;
  const bucketCount = data.storage?.bucketCount ?? data.storageUsage?.bucketCount;
  const physicalRoot = data.storage?.storageRoot;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            A permission-aware view of your organization&apos;s cloud resources.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {errors.length > 0 ? (
        <EmptyState title="Some dashboard data is unavailable" description={errors.join(' · ')} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canReadStorage(permissions) ? (
          <>
            <MetricCard
              label="Storage used"
              value={logicalBytes === undefined ? '…' : formatBytes(logicalBytes)}
              description="Logical object bytes"
              href="/storage/usage"
            />
            <MetricCard
              label="Objects"
              value={objectCount === undefined ? '…' : objectCount.toLocaleString()}
              description="Accessible live objects"
              href="/storage/files"
            />
            <MetricCard
              label="Buckets"
              value={bucketCount === undefined ? '…' : bucketCount.toLocaleString()}
              description="Organization buckets"
              href="/storage/buckets"
            />
            <MetricCard
              label="Uploads"
              value={data.storage ? data.storage.uploadsLast24h.toLocaleString() : '…'}
              description="Completed in the last 24 hours"
              href="/storage/files"
            />
          </>
        ) : null}

        {canReadBackups(permissions) ? (
          <MetricCard
            label="Backups"
            value={data.backup ? data.backup.snapshotCount.toLocaleString() : '…'}
            description="Verified snapshots"
            href="/backups"
          />
        ) : null}
        {canReadArtifacts(permissions) ? (
          <MetricCard
            label="Artifacts"
            value={data.projects ? data.projects.length.toLocaleString() : '…'}
            description="Artifact projects"
            href="/artifacts"
          />
        ) : null}
        {canReadInfrastructure(permissions) ? (
          <>
            <MetricCard
              label="Server health"
              value={data.infrastructure?.server.status ?? '…'}
              description="Host collector status"
              href="/infrastructure/server"
            />
            <MetricCard
              label="Disk health"
              value={data.infrastructure?.disks.status ?? '…'}
              description="Physical disk collector"
              href="/infrastructure/disks"
            />
          </>
        ) : null}
        {canReadActivity(permissions) ? (
          <MetricCard
            label="API activity"
            value={data.activity ? data.activity.length.toLocaleString() : '…'}
            description="Recent audit events"
            href="/activity"
          />
        ) : null}
      </div>

      {canReadStorage(permissions) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <StorageBreakdown
            title="Provider breakdown"
            description="Providers visible to your storage permissions."
          >
            {data.providers?.length ? (
              data.providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <span className="truncate text-sm text-slate-700">{provider.name}</span>
                  <Badge>{provider.status}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No providers available.</p>
            )}
          </StorageBreakdown>
          <StorageBreakdown
            title="Bucket breakdown"
            description="Logical object usage. Physical disk usage is shown separately."
          >
            {data.storage?.buckets.length ? (
              data.storage.buckets.map((bucket) => (
                <div
                  key={bucket.bucketId}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <span className="truncate text-sm text-slate-700">{bucket.name}</span>
                  <span className="whitespace-nowrap text-sm text-slate-500">
                    {bucket.objectCount.toLocaleString()} · {formatBytes(bucket.bytes)}
                  </span>
                </div>
              ))
            ) : data.buckets?.length ? (
              data.buckets.map((bucket) => (
                <div key={bucket.id} className="flex justify-between py-2 text-sm text-slate-700">
                  <span>{bucket.name}</span>
                  <span className="text-slate-500">Usage detail restricted</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No buckets available.</p>
            )}
          </StorageBreakdown>
        </div>
      ) : null}

      {canReadInfrastructure(permissions) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Physical disk usage</CardTitle>
            <CardDescription>
              Filesystem capacity is physical host usage and is different from logical object
              storage above.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Storage root</p>
              <p className="mt-1 font-medium text-slate-900">{physicalRoot?.path ?? '…'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Used</p>
              <p className="mt-1 font-medium text-slate-900">
                {physicalRoot?.usedBytes === null || physicalRoot?.usedBytes === undefined
                  ? '…'
                  : formatBytes(physicalRoot.usedBytes)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Free</p>
              <p className="mt-1 font-medium text-slate-900">
                {physicalRoot?.freeBytes === null || physicalRoot?.freeBytes === undefined
                  ? '…'
                  : formatBytes(physicalRoot.freeBytes)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canReadActivity(permissions) && data.activity?.length ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent API activity</CardTitle>
              <CardDescription>Latest organization-scoped audit events.</CardDescription>
            </div>
            <Link className="text-sm font-medium text-slate-700 underline" to="/activity">
              View all
            </Link>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.activity.slice(0, 8).map((event) => (
              <div key={event.id} className="rounded-md border border-slate-200 p-3">
                <p className="truncate text-sm font-medium text-slate-900">{event.action}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.resourceType} · {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, description, href }: MetricCardProps) {
  const content = (
    <Card className="h-full transition hover:border-slate-300">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-500">{description}</CardContent>
    </Card>
  );

  return href ? <Link to={href}>{content}</Link> : content;
}

function StorageBreakdown({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
