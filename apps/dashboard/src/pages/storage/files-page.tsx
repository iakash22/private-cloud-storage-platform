import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BucketSelector,
  Button,
  DeleteConfirmation,
  Dialog,
  DialogActions,
  FileExplorer,
  Input,
  Label,
  ObjectDetails,
  ShareDialog,
  type ExplorerEntry,
  type ShareDialogCreateInput,
  type SortDirection,
  type SortField,
  type ViewMode,
} from '@vaultstack/ui';
import type { PublicTeam } from '@vaultstack/types';
import { useAuth } from '../../context/auth-context.js';
import { useObjectList, useSelectedObject, useBuckets } from '../../hooks/use-storage.js';
import { useUploadQueue } from '../../hooks/use-upload-queue.js';
import { apiClient } from '../../lib/api.js';
import {
  addTrashItem,
  buildObjectKey,
  canDeleteStorage,
  canReadStorage,
  canShareStorage,
  canUploadStorage,
  getFavoriteIds,
  getSelectedBucketId,
  recordRecentFile,
  setSelectedBucketId,
  toggleFavorite,
} from '../../lib/storage-preferences.js';

export function FilesPage() {
  const { permissions, activeOrganizationId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { buckets, loading: bucketsLoading } = useBuckets();
  const [bucketId, setBucketId] = useState<string | undefined>(
    searchParams.get('bucket') ?? getSelectedBucketId(),
  );
  const [prefix, setPrefix] = useState(searchParams.get('prefix') ?? '');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedEntry, setSelectedEntry] = useState<ExplorerEntry | undefined>();
  const [favoriteIds, setFavoriteIds] = useState(getFavoriteIds());
  const [showUploader, setShowUploader] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerEntry | undefined>();
  const [renameTarget, setRenameTarget] = useState<ExplorerEntry | undefined>();
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<ExplorerEntry | undefined>();
  const [moveBucketId, setMoveBucketId] = useState('');
  const [moveKey, setMoveKey] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const { page, loading, error, refresh, loadMore } = useObjectList(bucketId, prefix);
  const { object } = useSelectedObject(
    selectedEntry?.kind === 'file' ? selectedEntry.id : undefined,
  );
  const { uploads, enqueueFiles, cancelUpload, retryUpload, pauseUpload, resumeUpload } =
    useUploadQueue({
      onComplete: () => {
        void refresh();
      },
    });

  const selectedBucket = useMemo(
    () => buckets.find((bucket) => bucket.id === bucketId),
    [buckets, bucketId],
  );

  useEffect(() => {
    if (!bucketId && buckets[0]?.id) {
      setBucketId(buckets[0].id);
    }
  }, [bucketId, buckets]);

  useEffect(() => {
    if (!bucketId) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('bucket', bucketId);
    if (prefix) {
      next.set('prefix', prefix);
    } else {
      next.delete('prefix');
    }
    setSearchParams(next, { replace: true });
    setSelectedBucketId(bucketId);
  }, [bucketId, prefix, searchParams, setSearchParams]);

  const handleOpen = (entry: ExplorerEntry) => {
    if (entry.kind === 'folder') {
      setPrefix(entry.key);
      setSelectedEntry(undefined);
      return;
    }

    setSelectedEntry(entry);
    if (bucketId) {
      recordRecentFile({
        id: entry.id,
        bucketId,
        key: entry.key,
        name: entry.name,
      });
    }
  };

  const handleDownload = async (entry: ExplorerEntry) => {
    try {
      const download = await apiClient.createDownloadUrl(entry.id);
      window.open(download.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Download failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await apiClient.deleteObject(deleteTarget.id);
      addTrashItem({
        id: deleteTarget.id,
        bucketId: bucketId ?? '',
        key: deleteTarget.key,
        name: deleteTarget.name,
        size: deleteTarget.size ?? 0,
      });
      setDeleteTarget(undefined);
      setSelectedEntry(undefined);
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Delete failed');
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !bucketId || !renameValue.trim()) {
      return;
    }

    try {
      const destinationKey = buildObjectKey(prefix, renameValue.trim());
      await apiClient.moveObject(renameTarget.id, {
        destinationBucketId: bucketId,
        destinationKey,
      });
      setRenameTarget(undefined);
      setRenameValue('');
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Rename failed');
    }
  };

  const handleMove = async () => {
    if (!moveTarget || !moveBucketId || !moveKey.trim()) {
      return;
    }

    try {
      await apiClient.moveObject(moveTarget.id, {
        destinationBucketId: moveBucketId,
        destinationKey: moveKey.trim(),
      });
      setMoveTarget(undefined);
      setMoveKey('');
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Move failed');
    }
  };

  const handleCopy = async (entry: ExplorerEntry) => {
    if (!bucketId) {
      return;
    }

    try {
      await apiClient.copyObject(entry.id, {
        destinationBucketId: bucketId,
        destinationKey: `${entry.key}.copy`,
      });
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Copy failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Files</h2>
          <p className="text-sm text-slate-500">
            Browse, upload, and manage objects by bucket and prefix.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <BucketSelector
            buckets={buckets}
            value={bucketId}
            disabled={bucketsLoading}
            onChange={setBucketId}
          />
        </div>
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <FileExplorer
            prefix={prefix}
            page={page}
            loading={loading || bucketsLoading}
            error={error ?? undefined}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            search={search}
            onSearchChange={setSearch}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortFieldChange={setSortField}
            onSortDirectionChange={setSortDirection}
            selectedId={selectedEntry?.id}
            favoriteIds={favoriteIds}
            onNavigatePrefix={setPrefix}
            onSelect={setSelectedEntry}
            onOpen={handleOpen}
            onDownload={
              canReadStorage(permissions)
                ? (entry) => {
                    void handleDownload(entry);
                  }
                : undefined
            }
            onRename={
              canUploadStorage(permissions)
                ? (entry) => {
                    if (entry.kind !== 'file') {
                      return;
                    }
                    setRenameTarget(entry);
                    setRenameValue(entry.name);
                  }
                : undefined
            }
            onDelete={canDeleteStorage(permissions) ? setDeleteTarget : undefined}
            onToggleFavorite={(entry) => {
              if (entry.kind !== 'file') {
                return;
              }
              setFavoriteIds(toggleFavorite(entry.id));
            }}
            onUploadClick={() => {
              setShowUploader((current) => !current);
            }}
            onFilesSelected={(files) => {
              if (!bucketId || !canUploadStorage(permissions)) {
                return;
              }
              enqueueFiles(files, bucketId, prefix);
            }}
            uploads={uploads}
            onCancelUpload={(uploadId) => {
              cancelUpload(uploadId);
            }}
            onRetryUpload={retryUpload}
            onPauseUpload={pauseUpload}
            onResumeUpload={resumeUpload}
            onRetry={() => {
              void refresh();
            }}
            uploadDisabled={!bucketId || !canUploadStorage(permissions)}
            showUploader={showUploader}
          />

          {page?.isTruncated ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadMore()}
              disabled={!page.nextCursor}
            >
              Load more
            </Button>
          ) : null}
        </div>

        <div className="space-y-4">
          <ObjectDetails object={object} bucket={selectedBucket} />
          {selectedEntry?.kind === 'file' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDownload(selectedEntry)}
              >
                Download
              </Button>
              {canUploadStorage(permissions) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCopy(selectedEntry)}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMoveTarget(selectedEntry);
                      setMoveBucketId(bucketId ?? '');
                      setMoveKey(selectedEntry.key);
                    }}
                  >
                    Move
                  </Button>
                </>
              ) : null}
              {canShareStorage(permissions) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShareError(null);
                    setShareUrl(null);
                    setShareOpen(true);
                    if (activeOrganizationId) {
                      void apiClient
                        .listTeams(activeOrganizationId)
                        .then(setTeams)
                        .catch(() => {
                          setTeams([]);
                        });
                    }
                  }}
                >
                  Share
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        title="Delete object"
        description={`Delete "${deleteTarget?.name}" from this bucket?`}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined);
          }
        }}
        onConfirm={() => void handleDelete()}
      />

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(undefined);
          }
        }}
        title="Rename object"
        description="Renaming moves the object to a new key in the same bucket."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Rename"
            onCancel={() => {
              setRenameTarget(undefined);
            }}
            onConfirm={() => void handleRename()}
          />
        }
      >
        <div className="space-y-2">
          <Label htmlFor="rename-value">New name</Label>
          <Input
            id="rename-value"
            value={renameValue}
            onChange={(event) => {
              setRenameValue(event.target.value);
            }}
          />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(moveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setMoveTarget(undefined);
          }
        }}
        title="Move object"
        description="Move this object to another bucket or key."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Move"
            onCancel={() => {
              setMoveTarget(undefined);
            }}
            onConfirm={() => void handleMove()}
          />
        }
      >
        <div className="space-y-3">
          <BucketSelector buckets={buckets} value={moveBucketId} onChange={setMoveBucketId} />
          <div className="space-y-2">
            <Label htmlFor="move-key">Destination key</Label>
            <Input
              id="move-key"
              value={moveKey}
              onChange={(event) => {
                setMoveKey(event.target.value);
              }}
            />
          </div>
        </div>
      </Dialog>

      <ShareDialog
        open={shareOpen}
        objectName={selectedEntry?.name}
        teams={teams}
        submitting={shareSubmitting}
        error={shareError}
        createdUrl={shareUrl}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) {
            setShareUrl(null);
            setShareError(null);
          }
        }}
        onCreate={(input: ShareDialogCreateInput) => {
          if (!selectedEntry) {
            return;
          }
          setShareSubmitting(true);
          setShareError(null);
          void apiClient
            .createShare(selectedEntry.id, input)
            .then((share) => {
              setShareUrl(`${window.location.origin}/s/${share.token}`);
            })
            .catch((caught: unknown) => {
              setShareError(caught instanceof Error ? caught.message : 'Unable to create share');
            })
            .finally(() => {
              setShareSubmitting(false);
            });
        }}
      />
    </div>
  );
}
