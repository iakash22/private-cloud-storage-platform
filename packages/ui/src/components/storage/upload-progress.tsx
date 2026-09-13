import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { useSmoothNumber } from '../../hooks/use-smooth-number.js';
import { formatBytes } from '../../lib/storage-utils.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../button.js';
import { Progress } from '../progress.js';

export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'paused'
  | 'awaiting-file'
  | 'completing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface UploadItem {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  loaded?: number;
  status: UploadStatus;
  error?: string;
  completedParts?: number;
  totalParts?: number;
}

export interface UploadProgressProps {
  uploads: UploadItem[];
  onCancel?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
  onPause?: (uploadId: string) => void;
  onResume?: (uploadId: string) => void;
  className?: string;
}

const STATUS_LABELS: Record<UploadStatus, string> = {
  pending: 'Waiting',
  uploading: 'Uploading',
  paused: 'Paused',
  'awaiting-file': 'Resume needed',
  completing: 'Finalizing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function describeMeta(upload: UploadItem): string {
  const status = STATUS_LABELS[upload.status];
  const loaded = upload.loaded ?? Math.round((upload.progress / 100) * upload.size);
  const sizeLabel = formatBytes(upload.size);

  if (
    upload.status === 'completed' ||
    upload.status === 'pending' ||
    upload.status === 'awaiting-file' ||
    upload.status === 'failed' ||
    upload.status === 'cancelled'
  ) {
    return `${sizeLabel} · ${status}`;
  }

  const parts =
    upload.totalParts && upload.totalParts > 1
      ? ` · part ${upload.completedParts ?? 0}/${upload.totalParts}`
      : '';

  return `${formatBytes(loaded)} / ${sizeLabel} · ${status}${parts}`;
}

function UploadRow({
  upload,
  onCancel,
  onRetry,
  onPause,
  onResume,
}: {
  upload: UploadItem;
  onCancel?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
  onPause?: (uploadId: string) => void;
  onResume?: (uploadId: string) => void;
}) {
  const smoothPercent = useSmoothNumber(upload.progress, { durationMs: 360 });
  const displayPercent = Math.round(smoothPercent);
  const isActive =
    upload.status === 'uploading' ||
    upload.status === 'completing' ||
    upload.status === 'pending' ||
    upload.status === 'paused';

  return (
    <li className="space-y-2 rounded-md transition-shadow duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-900">{upload.fileName}</p>
            <p
              className={cn(
                'shrink-0 text-lg font-semibold tabular-nums tracking-tight text-slate-900 transition-all duration-300',
                isActive && 'scale-105',
              )}
              aria-live="polite"
            >
              {upload.status === 'completed' ? '100%' : `${displayPercent}%`}
            </p>
          </div>
          <p className="text-xs text-slate-500">{describeMeta(upload)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {upload.status === 'uploading' && onPause ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Pause upload ${upload.fileName}`}
              onClick={() => {
                onPause(upload.id);
              }}
            >
              <Pause aria-hidden className="h-4 w-4" />
            </Button>
          ) : null}
          {(upload.status === 'paused' || upload.status === 'awaiting-file') && onResume ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Resume upload ${upload.fileName}`}
              onClick={() => {
                onResume(upload.id);
              }}
            >
              <Play aria-hidden className="h-4 w-4" />
            </Button>
          ) : null}
          {(upload.status === 'uploading' ||
            upload.status === 'paused' ||
            upload.status === 'pending') &&
          onCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Cancel upload ${upload.fileName}`}
              onClick={() => {
                onCancel(upload.id);
              }}
            >
              <X aria-hidden className="h-4 w-4" />
            </Button>
          ) : null}
          {upload.status === 'failed' && onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Retry upload ${upload.fileName}`}
              onClick={() => {
                onRetry(upload.id);
              }}
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
      <Progress
        value={upload.progress}
        indeterminate={upload.status === 'pending'}
      />
      {upload.error ? <p className="text-xs text-red-600">{upload.error}</p> : null}
    </li>
  );
}

export function UploadProgressPanel({
  uploads,
  onCancel,
  onRetry,
  onPause,
  onResume,
  className,
}: UploadProgressProps) {
  if (uploads.length === 0) {
    return null;
  }

  const activeCount = uploads.filter(
    (upload) =>
      upload.status === 'pending' ||
      upload.status === 'uploading' ||
      upload.status === 'paused' ||
      upload.status === 'completing' ||
      upload.status === 'awaiting-file',
  ).length;

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Uploads</h3>
        {activeCount > 0 ? <p className="text-xs text-slate-500">{activeCount} active</p> : null}
      </div>
      <ul className="space-y-4">
        {uploads.map((upload) => (
          <UploadRow
            key={upload.id}
            upload={upload}
            onCancel={onCancel}
            onRetry={onRetry}
            onPause={onPause}
            onResume={onResume}
          />
        ))}
      </ul>
    </div>
  );
}
