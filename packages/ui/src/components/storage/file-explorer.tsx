import type { PublicObjectListPage } from '@vaultstack/types';
import { sortEntries, splitObjectKey } from '../../lib/storage-utils.js';
import { cn } from '../../lib/utils.js';
import { Breadcrumbs } from './breadcrumbs.js';
import { EmptyState, ErrorState } from './empty-state.js';
import { FileGrid } from './file-grid.js';
import { FileTable } from './file-table.js';
import { FileUploader } from './file-uploader.js';
import { StorageToolbar, type ViewMode } from './storage-toolbar.js';
import type { ExplorerEntry } from './types.js';
import { UploadProgressPanel, type UploadItem } from './upload-progress.js';
import { FileListSkeleton } from '../skeletons.js';

export interface FileExplorerProps {
  prefix: string;
  page?: PublicObjectListPage;
  loading?: boolean;
  error?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sortField: 'name' | 'size' | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  onSortFieldChange: (field: 'name' | 'size' | 'updatedAt') => void;
  onSortDirectionChange: (direction: 'asc' | 'desc') => void;
  selectedId?: string;
  favoriteIds?: Set<string>;
  onNavigatePrefix: (prefix: string) => void;
  onSelect: (entry: ExplorerEntry) => void;
  onOpen: (entry: ExplorerEntry) => void;
  onDownload?: (entry: ExplorerEntry) => void;
  onRename?: (entry: ExplorerEntry) => void;
  onDelete?: (entry: ExplorerEntry) => void;
  onToggleFavorite?: (entry: ExplorerEntry) => void;
  onUploadClick: () => void;
  onCreateFolder?: () => void;
  onFilesSelected: (files: File[]) => void;
  uploads?: UploadItem[];
  onCancelUpload?: (uploadId: string) => void;
  onRetryUpload?: (uploadId: string) => void;
  onPauseUpload?: (uploadId: string) => void;
  onResumeUpload?: (uploadId: string) => void;
  onRetry?: () => void;
  uploadDisabled?: boolean;
  showUploader?: boolean;
  className?: string;
}

function buildEntries(
  page: PublicObjectListPage | undefined,
  prefix: string,
  favoriteIds?: Set<string>,
): ExplorerEntry[] {
  if (!page) {
    return [];
  }

  const folderPrefixes = page.folders.map((folder) => folder.prefix);
  const folders: ExplorerEntry[] = folderPrefixes.map((folderPrefix) => {
    const { name } = splitObjectKey(folderPrefix.replace(/\/$/, ''));
    return {
      id: `folder:${folderPrefix}`,
      name: name || folderPrefix,
      kind: 'folder',
      key: folderPrefix,
    };
  });

  const files: ExplorerEntry[] = page.objects
    .filter((object) => !object.key.endsWith('/'))
    .map((object) => {
      const { name } = splitObjectKey(object.key);
      return {
        id: object.id,
        name,
        kind: 'file',
        key: object.key,
        size: object.size,
        contentType: object.contentType,
        updatedAt: object.updatedAt,
        favorite: favoriteIds?.has(object.id),
      };
    });

  return [...folders, ...files].filter((entry) => {
    if (!prefix) {
      return true;
    }

    return entry.key.startsWith(prefix);
  });
}

export function FileExplorer({
  prefix,
  page,
  loading = false,
  error,
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
  selectedId,
  favoriteIds,
  onNavigatePrefix,
  onSelect,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onToggleFavorite,
  onUploadClick,
  onCreateFolder,
  onFilesSelected,
  uploads = [],
  onCancelUpload,
  onRetryUpload,
  onPauseUpload,
  onResumeUpload,
  onRetry,
  uploadDisabled = false,
  showUploader = false,
  className,
}: FileExplorerProps) {
  const entries = sortEntries(
    buildEntries(page, prefix, favoriteIds).filter((entry) => {
      if (!search.trim()) {
        return true;
      }

      return entry.name.toLowerCase().includes(search.trim().toLowerCase());
    }),
    sortField,
    sortDirection,
  );

  return (
    <div className={cn('space-y-4', className)}>
      <Breadcrumbs prefix={prefix} onNavigate={onNavigatePrefix} />
      <StorageToolbar
        search={search}
        onSearchChange={onSearchChange}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={onSortFieldChange}
        onSortDirectionChange={onSortDirectionChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onUploadClick={onUploadClick}
        onCreateFolder={onCreateFolder}
        uploadDisabled={uploadDisabled}
      />

      {showUploader ? (
        <FileUploader onFilesSelected={onFilesSelected} disabled={uploadDisabled} />
      ) : null}
      <UploadProgressPanel
        uploads={uploads}
        onCancel={onCancelUpload}
        onRetry={onRetryUpload}
        onPause={onPauseUpload}
        onResume={onResumeUpload}
      />

      {loading ? <FileListSkeleton rows={6} /> : null}

      {!loading && error ? (
        <ErrorState title="Unable to load files" description={error} onRetry={onRetry} />
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <EmptyState
          title="This folder is empty"
          description="Upload files or create folders by uploading objects with a key prefix."
        />
      ) : null}

      {!loading && !error && entries.length > 0 ? (
        viewMode === 'grid' ? (
          <FileGrid
            entries={entries}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
          />
        ) : (
          <FileTable
            entries={entries}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
            onDownload={onDownload}
            onRename={onRename}
            onDelete={onDelete}
            onToggleFavorite={onToggleFavorite}
          />
        )
      ) : null}
    </div>
  );
}
