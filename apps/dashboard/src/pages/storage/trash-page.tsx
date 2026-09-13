import { useState } from 'react';
import { Button, EmptyState, formatBytes, formatDate, PageHeader } from '@vaultstack/ui';
import { Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/api.js';
import { canUploadStorage, getTrashItems, removeTrashItem, type TrashRecord } from '../../lib/storage-preferences.js';
import { useAuth } from '../../context/auth-context.js';

export function TrashPage() {
  const { permissions } = useAuth();
  const [items, setItems] = useState<TrashRecord[]>(getTrashItems());
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string>();

  const restore = async (item: TrashRecord) => {
    setRestoringId(item.id);
    setError(null);
    try {
      const page = await apiClient.listObjectVersions(item.id);
      const restorable =
        page.versions.find((version) => !version.isDeleteMarker && !version.isCurrent) ??
        page.versions.find((version) => !version.isDeleteMarker);
      if (!restorable) {
        throw new Error(
          'No restorable version exists. Unversioned deletes are permanent.',
        );
      }
      await apiClient.restoreObjectVersion(item.id, restorable.versionId);
      setItems(removeTrashItem(item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to restore object');
    } finally {
      setRestoringId(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        description="Recently deleted objects from this browser. Versioned buckets can restore a previous version; unversioned deletes cannot be recovered."
        icon={<Trash2 className="h-5 w-5" aria-hidden="true" />}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {items.length === 0 ? (
        <EmptyState
          title="Trash is empty"
          description="Deleted objects appear here so you can restore a versioned file or clear the local record."
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-slate-500">
                  {item.key} · {formatBytes(item.size)} · deleted {formatDate(item.deletedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canUploadStorage(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoringId === item.id}
                    aria-label={`Restore ${item.name}`}
                    onClick={() => void restore(item)}
                  >
                    {restoringId === item.id ? 'Restoring…' : 'Restore'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setItems(removeTrashItem(item.id));
                  }}
                >
                  Remove record
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
