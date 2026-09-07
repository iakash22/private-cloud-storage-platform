import { Folder, Star } from 'lucide-react';
import { formatBytes, formatDate } from '../../lib/storage-utils.js';
import { cn } from '../../lib/utils.js';
import type { FileGridProps } from './types.js';

export function FileGrid({
  entries,
  selectedId,
  onSelect,
  onOpen,
  onToggleFavorite: _onToggleFavorite,
}: FileGridProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-label={entry.name}
          className={cn(
            'flex flex-col items-start rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow',
            selectedId === entry.id && 'border-slate-900 ring-2 ring-slate-900/10',
          )}
          onClick={() => {
            onSelect(entry);
          }}
          onDoubleClick={() => {
            onOpen(entry);
          }}
        >
          <div className="mb-3 flex w-full items-start justify-between">
            {entry.kind === 'folder' ? (
              <Folder aria-hidden className="h-8 w-8 text-amber-500" />
            ) : (
              <span aria-hidden className="inline-block h-8 w-8 rounded bg-slate-200" />
            )}
            {entry.favorite ? <Star aria-label="Favorite" className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
          </div>
          <span className="line-clamp-2 w-full font-medium text-slate-900">{entry.name}</span>
          <span className="mt-1 text-xs text-slate-500">
            {entry.kind === 'folder'
              ? 'Folder'
              : `${formatBytes(entry.size ?? 0)} · ${entry.updatedAt ? formatDate(entry.updatedAt) : '—'}`}
          </span>
        </button>
      ))}
    </div>
  );
}
