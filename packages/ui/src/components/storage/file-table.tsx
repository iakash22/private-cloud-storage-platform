import { Download, Folder, MoreHorizontal, Star, Trash2 } from 'lucide-react';
import { formatBytes, formatDate } from '../../lib/storage-utils.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../button.js';
import type { FileTableProps } from './types.js';

export function FileTable({
  entries,
  selectedId,
  onSelect,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onToggleFavorite,
}: FileTableProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Name
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Size
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
              Modified
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={cn(
                'cursor-pointer hover:bg-slate-50',
                selectedId === entry.id && 'bg-slate-100',
              )}
              onClick={() => {
                onSelect(entry);
              }}
              onDoubleClick={() => {
                onOpen(entry);
              }}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {entry.kind === 'folder' ? (
                    <Folder aria-hidden className="h-4 w-4 text-amber-500" />
                  ) : (
                    <span aria-hidden className="inline-block h-4 w-4 rounded bg-slate-200" />
                  )}
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(entry);
                    }}
                  >
                    {entry.name}
                  </button>
                  {entry.favorite ? (
                    <Star aria-label="Favorite" className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {entry.kind === 'folder' ? '—' : formatBytes(entry.size ?? 0)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {entry.updatedAt ? formatDate(entry.updatedAt) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {onToggleFavorite ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={entry.favorite ? 'Remove favorite' : 'Add favorite'}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(entry);
                      }}
                    >
                      <Star aria-hidden className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {entry.kind === 'file' && onDownload ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Download ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownload(entry);
                      }}
                    >
                      <Download aria-hidden className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {onRename ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Rename ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRename(entry);
                      }}
                    >
                      <MoreHorizontal aria-hidden className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {onDelete ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Delete ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(entry);
                      }}
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
