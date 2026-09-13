import { useCallback, useEffect, useState } from 'react';
import type {
  PublicAuditLog,
  PublicFolderAccessRule,
  PublicTeam,
  PublicUser,
} from '@vaultstack/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from '@vaultstack/ui';
import { UsersRound } from 'lucide-react';
import { useAuth } from '../../context/auth-context.js';
import { useBuckets } from '../../hooks/use-storage.js';
import { apiClient } from '../../lib/api.js';
import { canUploadStorage } from '../../lib/storage-preferences.js';

export function CollaborationPage() {
  const { activeOrganizationId, permissions } = useAuth();
  const { buckets } = useBuckets();
  const [bucketId, setBucketId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [role, setRole] = useState('VIEWER');
  const [teamId, setTeamId] = useState('');
  const [userId, setUserId] = useState('');
  const [subjectType, setSubjectType] = useState<'TEAM' | 'USER'>('TEAM');
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [rules, setRules] = useState<PublicFolderAccessRule[]>([]);
  const [activity, setActivity] = useState<PublicAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (buckets[0] && !bucketId) {
      setBucketId(buckets[0].id);
    }
  }, [bucketId, buckets]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    void apiClient
      .listTeams(activeOrganizationId)
      .then(setTeams)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Unable to load teams');
      });
    void apiClient
      .listUsers(activeOrganizationId)
      .then(setUsers)
      .catch(() => {
        setUsers([]);
      });
  }, [activeOrganizationId]);

  const loadRules = useCallback(async (): Promise<void> => {
    if (!bucketId) return;
    setLoading(true);
    try {
      setRules(await apiClient.listFolderAccessRules(bucketId));
      setActivity(
        await apiClient.listAuditLogs({
          resourceType: 'folder_access',
          limit: 25,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load folder access');
    } finally {
      setLoading(false);
    }
  }, [bucketId]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const createRule = async (): Promise<void> => {
    if (!bucketId || !prefix.trim() || (subjectType === 'TEAM' ? !teamId : !userId)) return;
    try {
      await apiClient.createFolderAccessRule({
        bucketId,
        prefix: prefix.trim(),
        role: role as 'VIEWER' | 'EDITOR' | 'MANAGER',
        ...(subjectType === 'TEAM' ? { teamId } : { userId }),
      });
      setPrefix('');
      await loadRules();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create folder access');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folder collaboration"
        description="Share folder access with organization teams using server-side ACL rules."
        icon={<UsersRound className="h-5 w-5" aria-hidden="true" />}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading collaboration state…</p> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create team-folder access</CardTitle>
          <CardDescription>
            Folder prefixes are normalized on the server and never expose provider credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="collaboration-bucket">Bucket</Label>
            <Select
              id="collaboration-bucket"
              value={bucketId}
              onChange={setBucketId}
              options={buckets.map((bucket) => ({ value: bucket.id, label: bucket.name }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collaboration-prefix">Folder prefix</Label>
            <Input
              id="collaboration-prefix"
              value={prefix}
              onChange={(event) => {
                setPrefix(event.target.value);
              }}
              placeholder="projects/acme/"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collaboration-subject-type">Subject type</Label>
            <Select
              id="collaboration-subject-type"
              value={subjectType}
              onChange={(value) => {
                setSubjectType(value as 'TEAM' | 'USER');
                setTeamId('');
                setUserId('');
              }}
              options={[
                { value: 'TEAM', label: 'Team' },
                { value: 'USER', label: 'User' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collaboration-subject">
              {subjectType === 'TEAM' ? 'Team' : 'User'}
            </Label>
            <Select
              id="collaboration-subject"
              value={subjectType === 'TEAM' ? teamId : userId}
              onChange={subjectType === 'TEAM' ? setTeamId : setUserId}
              options={
                subjectType === 'TEAM'
                  ? teams.map((team) => ({ value: team.id, label: team.name }))
                  : users.map((user) => ({ value: user.id, label: `${user.name} (${user.email})` }))
              }
              placeholder={`Select ${subjectType.toLowerCase()}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collaboration-role">Role</Label>
            <Select
              id="collaboration-role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'VIEWER', label: 'Viewer' },
                { value: 'EDITOR', label: 'Editor' },
                { value: 'MANAGER', label: 'Manager' },
              ]}
            />
          </div>
          {canUploadStorage(permissions) ? (
            <Button
              type="button"
              className="md:col-span-4 md:justify-self-end"
              onClick={() => void createRule()}
            >
              Grant folder access
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {!loading && rules.length === 0 ? (
        <EmptyState
          title="No folder access rules"
          description="Create a team rule to start collaborating on a folder."
        />
      ) : !loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active access rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-900">{rule.subjectName}</p>
                  <p className="text-xs text-slate-500">
                    {rule.prefix} · {rule.role}
                  </p>
                </div>
                {canUploadStorage(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void apiClient.deleteFolderAccessRule(rule.id).then(loadRules)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {!loading && activity.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent collaboration activity</CardTitle>
            <CardDescription>Folder grants and revocations for this organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">{entry.action}</p>
                <p className="text-xs text-slate-500">
                  {entry.actorName ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
