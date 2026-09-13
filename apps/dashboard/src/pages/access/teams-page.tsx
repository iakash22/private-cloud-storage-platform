import { useCallback, useEffect, useState } from 'react';
import type { PublicTeam, PublicTeamMember, PublicUser } from '@vaultstack/types';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
} from '@vaultstack/ui';
import { UsersRound } from 'lucide-react';
import { createTeamBodySchema, parseForm, updateTeamBodySchema } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import { canManageAccess } from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function TeamsPage() {
  const { activeOrganizationId, permissions } = useAuth();
  const manage = canManageAccess(permissions);
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [members, setMembers] = useState<PublicTeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [memberUserId, setMemberUserId] = useState('');

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      const [nextTeams, nextUsers] = await Promise.all([
        apiClient.listTeams(activeOrganizationId),
        apiClient.listUsers(activeOrganizationId),
      ]);
      setTeams(nextTeams);
      setUsers(nextUsers);
      setError(null);
      setSelectedId((current) => current ?? nextTeams[0]?.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load teams');
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeOrganizationId || !selectedId) {
      setMembers([]);
      return;
    }
    void apiClient
      .listTeamMembers(activeOrganizationId, selectedId)
      .then((next) => {
        setMembers(next);
        setMemberUserId((current) => current || users[0]?.id || '');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Unable to load members');
      });
  }, [activeOrganizationId, selectedId, users]);

  const handleCreate = async () => {
    if (!activeOrganizationId) {
      return;
    }
    const body = validate(parseForm(createTeamBodySchema, { name }));
    if (!body) {
      return;
    }
    try {
      const team = await apiClient.createTeam(activeOrganizationId, body.name);
      setCreateOpen(false);
      setName('');
      setSelectedId(team.id);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleAddMember = async () => {
    if (!activeOrganizationId || !selectedId || !memberUserId) {
      return;
    }
    try {
      await apiClient.addTeamMember(activeOrganizationId, selectedId, memberUserId);
      const next = await apiClient.listTeamMembers(activeOrganizationId, selectedId);
      setMembers(next);
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeOrganizationId || !selectedId) {
      return;
    }
    try {
      await apiClient.removeTeamMember(activeOrganizationId, selectedId, userId);
      setMembers((current) => current.filter((member) => member.userId !== userId));
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDelete = async () => {
    if (!activeOrganizationId || !selectedId) {
      return;
    }
    try {
      await apiClient.deleteTeam(activeOrganizationId, selectedId);
      setSelectedId(undefined);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRename = async () => {
    if (!activeOrganizationId || !selectedId) {
      return;
    }
    const body = validate(parseForm(updateTeamBodySchema, { name: renameValue }));
    if (!body) {
      return;
    }
    try {
      await apiClient.updateTeam(activeOrganizationId, selectedId, body.name);
      setRenameOpen(false);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const selected = teams.find((team) => team.id === selectedId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Group members for private file shares."
        icon={<UsersRound className="h-5 w-5" aria-hidden="true" />}
        actions={
          manage ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create team
            </Button>
          ) : null
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {teams.length === 0 ? (
        <EmptyState title="No teams" description="Create a team to share files with a subset of the organization." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <Card>
            <CardContent className="space-y-1 p-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    team.id === selectedId ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => setSelectedId(team.id)}
                >
                  {team.name}
                </button>
              ))}
            </CardContent>
          </Card>
          {selected ? (
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">{selected.name}</h3>
                  {manage ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRenameValue(selected.name);
                          setRenameOpen(true);
                        }}
                      >
                        Rename
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void handleDelete()}>
                        Delete team
                      </Button>
                    </div>
                  ) : null}
                </div>
                {manage ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <Label htmlFor="team-member">Add member</Label>
                      <Select
                        id="team-member"
                        aria-label="Add member"
                        value={memberUserId}
                        onChange={setMemberUserId}
                        options={users.map((user) => ({
                          value: user.id,
                          label: `${user.name} (${user.email})`,
                        }))}
                      />
                    </div>
                    <Button type="button" onClick={() => void handleAddMember()}>
                      Add
                    </Button>
                    <FieldError message={fieldErrors.userId} />
                  </div>
                ) : null}
                {members.length === 0 ? (
                  <p className="text-sm text-slate-500">No members yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {members.map((member) => (
                      <li key={member.id} className="flex items-center justify-between py-2 text-sm">
                        <span>
                          <span className="font-medium text-slate-900">{member.name}</span>
                          <span className="ml-2 text-slate-500">{member.email}</span>
                        </span>
                        {manage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRemoveMember(member.userId)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create team"
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={false}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div>
          <Label htmlFor="team-name">Name</Label>
          <Input
            id="team-name"
            value={name}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError message={fieldErrors.name} />
        </div>
      </Dialog>

      <Dialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename team"
        footer={
          <DialogActions
            confirmLabel="Save"
            confirmDisabled={false}
            onCancel={() => setRenameOpen(false)}
            onConfirm={() => void handleRename()}
          />
        }
      >
        <div>
          <Label htmlFor="team-rename">Name</Label>
          <Input
            id="team-rename"
            value={renameValue}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <FieldError message={fieldErrors.name} />
        </div>
      </Dialog>
    </div>
  );
}
