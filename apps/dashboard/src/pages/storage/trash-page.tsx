import { useState } from 'react';
import { Button, EmptyState, formatBytes, formatDate } from '@vaultstack/ui';
import { getTrashItems, removeTrashItem, type TrashRecord } from '../../lib/storage-preferences.js';

export function TrashPage() {
  const [items, setItems] = useState<TrashRecord[]>(getTrashItems());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Trash</h2>
        <p className="text-sm text-slate-500">
          Local trash history for recently deleted objects. Server-side restore arrives with lifecycle
          management in Phase 7.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Trash is empty"
          description="Deleted objects appear here as a browser-side audit trail until soft delete and restore are enabled in the storage engine."
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-slate-500">
                  {item.key} · {formatBytes(item.size)} · deleted {formatDate(item.deletedAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                aria-label={`Restore ${item.name}`}
                title="Restore requires Phase 7 lifecycle support"
              >
                Restore
              </Button>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
