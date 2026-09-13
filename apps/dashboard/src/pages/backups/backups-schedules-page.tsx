import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmation,
  Dialog,
  DialogActions,
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
} from '@vaultstack/ui';
import { CalendarClock } from 'lucide-react';
import type { BackupTargetName, PublicBackupSchedule } from '@vaultstack/types';
import { createBackupScheduleBodySchema, parseForm, updateBackupScheduleBodySchema } from '@vaultstack/validation';
import { apiClient } from '../../lib/api.js';
import { useAuth } from '../../context/auth-context.js';
import { canCreateBackups, canDeleteBackups } from '../../lib/backup-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

const TARGETS: BackupTargetName[] = [
  'VAULTSTACK_METADATA',
  'VAULTSTACK_OBJECT_METADATA',
  'APP_CONFIG',
  'POSTGRESQL',
  'MONGODB',
  'DOCKER_VOLUMES',
];

export function BackupsSchedulesPage() {
  const { permissions } = useAuth();
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [schedules, setSchedules] = useState<PublicBackupSchedule[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('nightly');
  const [intervalMinutes, setIntervalMinutes] = useState('1440');
  const [retentionDays, setRetentionDays] = useState('14');
  const [selected, setSelected] = useState<BackupTargetName[]>(['VAULTSTACK_METADATA']);
  const [deleteId, setDeleteId] = useState<string>();
  const [editId, setEditId] = useState<string>();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSchedules(await apiClient.listBackupSchedules());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load schedules');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (target: BackupTargetName) => {
    setSelected((current) =>
      current.includes(target) ? current.filter((item) => item !== target) : [...current, target],
    );
  };

  const create = async () => {
    try {
      if (editId) {
        const body = validate(
          parseForm(updateBackupScheduleBodySchema, {
            name,
            targets: selected,
            intervalMinutes: Number(intervalMinutes),
            retentionDays: retentionDays.trim() ? Number(retentionDays) : null,
          }),
        );
        if (!body) {
          return;
        }
        await apiClient.updateBackupSchedule(editId, body);
        setEditId(undefined);
      } else {
        const body = validate(
          parseForm(createBackupScheduleBodySchema, {
            name,
            targets: selected,
            intervalMinutes: Number(intervalMinutes),
            retentionDays: retentionDays.trim() ? Number(retentionDays) : null,
          }),
        );
        if (!body) {
          return;
        }
        await apiClient.createBackupSchedule(body);
      }
      setOpen(false);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const toggleEnabled = async (schedule: PublicBackupSchedule) => {
    try {
      await apiClient.updateBackupSchedule(schedule.id, { enabled: !schedule.enabled });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup schedules"
        description="Interval, targets, and retention policy."
        icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
        actions={
          canCreateBackups(permissions) ? (
            <Button
              type="button"
              onClick={() => {
                setEditId(undefined);
                setName('nightly');
                setIntervalMinutes('1440');
                setRetentionDays('14');
                setSelected(['VAULTSTACK_METADATA']);
                setOpen(true);
              }}
            >
              Create schedule
            </Button>
          ) : null
        }
      />
      {error ? <EmptyState title="Unable to load schedules" description={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedules</CardTitle>
          <CardDescription>{schedules.length} configured</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{schedule.name}</p>
                <p className="text-xs text-slate-500">
                  every {schedule.intervalMinutes}m · retention {schedule.retentionDays ?? 'none'}d
                  · {schedule.enabled ? 'enabled' : 'disabled'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canCreateBackups(permissions) ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleEnabled(schedule)}
                    >
                      {schedule.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditId(schedule.id);
                        setName(schedule.name);
                        setIntervalMinutes(String(schedule.intervalMinutes));
                        setRetentionDays(String(schedule.retentionDays ?? ''));
                        setSelected(schedule.targets);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </>
                ) : null}
                {canDeleteBackups(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteId(schedule.id);
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {schedules.length === 0 ? (
            <p className="text-sm text-slate-500">No schedules yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditId(undefined);
          }
        }}
        title={editId ? 'Edit schedule' : 'Create schedule'}
        footer={
          <DialogActions
            onCancel={() => {
              setOpen(false);
              setEditId(undefined);
            }}
            onConfirm={() => void create()}
            confirmLabel={editId ? 'Save' : 'Create'}
          />
        }
      >
        <div className="space-y-3">
          <Label htmlFor="schedule-name">Name</Label>
          <Input
            id="schedule-name"
            value={name}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <FieldError message={fieldErrors.name} />
          <Label htmlFor="schedule-interval">Interval (minutes)</Label>
          <Input
            id="schedule-interval"
            value={intervalMinutes}
            aria-invalid={Boolean(fieldErrors.intervalMinutes)}
            onChange={(event) => {
              setIntervalMinutes(event.target.value);
            }}
          />
          <FieldError message={fieldErrors.intervalMinutes} />
          <Label htmlFor="schedule-retention">Retention (days)</Label>
          <Input
            id="schedule-retention"
            value={retentionDays}
            onChange={(event) => {
              setRetentionDays(event.target.value);
            }}
          />
          <fieldset>
            <legend className="text-sm font-medium">Targets</legend>
            {TARGETS.map((target) => (
              <label key={target} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(target)}
                  onChange={() => {
                    toggle(target);
                  }}
                />
                {target}
              </label>
            ))}
          </fieldset>
        </div>
      </Dialog>

      <DeleteConfirmation
        open={Boolean(deleteId)}
        title="Delete schedule"
        description="The schedule will stop creating jobs. Existing snapshots are kept."
        onOpenChange={(next) => {
          if (!next) {
            setDeleteId(undefined);
          }
        }}
        onConfirm={() => {
          if (!deleteId) {
            return;
          }
          void apiClient
            .deleteBackupSchedule(deleteId)
            .then(() => {
              setDeleteId(undefined);
              void refresh();
            })
            .catch((caught: unknown) => {
              catchError(caught);
            });
        }}
      />
    </div>
  );
}
