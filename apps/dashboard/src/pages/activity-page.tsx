import { useEffect, useState } from 'react';
import type { PublicAuditLog } from '@vaultstack/types';
import {
  Button,
  CalendarRange,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  PageLoader,
  Select,
} from '@vaultstack/ui';
import { Activity as ActivityIcon } from 'lucide-react';
import { useAuth } from '../context/auth-context.js';
import { apiClient } from '../lib/api.js';

const ACTIONS = [
  'auth.2fa.setup',
  'auth.2fa.enable',
  'auth.2fa.disable',
  'storage.bucket.created',
  'storage.bucket.deleted',
  'storage.object.uploaded',
  'storage.object.downloaded',
  'storage.object.deleted',
  'storage.object.copied',
  'storage.object.moved',
  'share.created',
  'share.revoked',
  'api_key.created',
  'api_key.revoked',
  'backup.job.created',
  'backup.restore.created',
  'user.updated',
  'role.created',
  'role.assigned',
  'storage.provider.updated',
] as const;

export function ActivityPage() {
  const { activeOrganizationId } = useAuth();
  const [logs, setLogs] = useState<PublicAuditLog[]>([]);
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [result, setResult] = useState<'' | 'success' | 'failure'>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiClient.listAuditLogs({
        userId: userId.trim() || undefined,
        action: action || undefined,
        resourceType: resourceType.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        result: result || undefined,
        limit: 100,
      });
      setLogs(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeOrganizationId) {
      void loadLogs();
    }
    // Filters are applied explicitly with the form; only organization changes
    // should trigger an automatic refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganizationId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Review organization actions and filter audit events by date."
        icon={<ActivityIcon className="h-5 w-5" aria-hidden="true" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Audit filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              void loadLogs();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="activity-user">User ID</Label>
              <Input
                id="activity-user"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-action">Action</Label>
              <Select
                id="activity-action"
                value={action}
                onChange={setAction}
                placeholder="All actions"
                options={[
                  { value: '', label: 'All actions' },
                  ...ACTIONS.map((item) => ({ value: item, label: item })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-resource">Resource type</Label>
              <Input
                id="activity-resource"
                value={resourceType}
                placeholder="object, bucket, user…"
                onChange={(event) => {
                  setResourceType(event.target.value);
                }}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <CalendarRange
                from={dateFrom}
                to={dateTo}
                onFromChange={setDateFrom}
                onToChange={setDateTo}
                onClear={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-result">Result</Label>
              <Select
                id="activity-result"
                value={result}
                onChange={(next) => {
                  setResult(next as '' | 'success' | 'failure');
                }}
                options={[
                  { value: '', label: 'All results' },
                  { value: 'success', label: 'Success' },
                  { value: 'failure', label: 'Failure' },
                ]}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={loading} loadingLabel="Applying…">
                Apply filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {loading ? <PageLoader label="Loading activity" /> : null}
          {!loading && !error && logs.length === 0 ? (
            <p className="text-sm text-slate-500">No activity matches these filters.</p>
          ) : null}
          {!loading && !error && logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-3 py-3">User / service</th>
                    <th className="px-3 py-3">Action</th>
                    <th className="px-3 py-3">Resource</th>
                    <th className="px-3 py-3">Result</th>
                    <th className="px-3 py-3">Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        {log.actorName ?? log.userId ?? log.serviceAccountId ?? 'System'}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{log.action}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {log.resourceType}
                        {log.resourceId ? ` · ${log.resourceId}` : ''}
                      </td>
                      <td
                        className={
                          log.result === 'success'
                            ? 'px-3 py-3 text-emerald-700'
                            : 'px-3 py-3 text-red-700'
                        }
                      >
                        {log.result}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs text-slate-500">
                        {log.requestId ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
