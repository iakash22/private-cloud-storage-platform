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
  Input,
  Label,
} from '@vaultstack/ui';
import type { BackupTargetName, PublicBackupSchedule } from '@vaultstack/types';
import { apiClient } from '../../lib/api.js';
import { useAuth } from '../../context/auth-context.js';
import { canCreateBackups, canDeleteBackups } from '../../lib/backup-permissions.js';

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
  const [schedules, setSchedules] = useState<PublicBackupSchedule[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('nightly');
  const [intervalMinutes, setIntervalMinutes] = useState('1440');
  const [retentionDays, setRetentionDays] = useState('14');
  const [selected, setSelected] = useState<BackupTargetName[]>(['VAULTSTACK_METADATA']);
  const [deleteId, setDeleteId] = useState<string>();
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
      await apiClient.createBackupSchedule({
        name,
        targets: selected,
        intervalMinutes: Number(intervalMinutes),
        retentionDays: Number(retentionDays),
      });
      setOpen(false);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create schedule');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Backup schedules</h2>
          <p className="text-sm text-slate-500">Interval, targets, and retention policy.</p>
        </div>
        {canCreateBackups(permissions) ? (
          <Button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Create schedule
          </Button>
        ) : null}
      </div>
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
          ))}
          {schedules.length === 0 ? (
            <p className="text-sm text-slate-500">No schedules yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create schedule"
        footer={
          <DialogActions
            onCancel={() => {
              setOpen(false);
            }}
            onConfirm={() => void create()}
            confirmLabel="Create"
          />
        }
      >
        <div className="space-y-3">
          <Label htmlFor="schedule-name">Name</Label>
          <Input
            id="schedule-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Label htmlFor="schedule-interval">Interval (minutes)</Label>
          <Input
            id="schedule-interval"
            value={intervalMinutes}
            onChange={(event) => {
              setIntervalMinutes(event.target.value);
            }}
          />
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
          void apiClient.deleteBackupSchedule(deleteId).then(() => {
            setDeleteId(undefined);
            void refresh();
          });
        }}
      />
    </div>
  );
}
