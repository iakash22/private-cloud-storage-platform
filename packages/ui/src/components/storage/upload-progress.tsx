import { Pause, Play, RotateCcw, X } from 'lucide-react';
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
  status: UploadStatus;
  error?: string;
}

export interface UploadProgressProps {
  uploads: UploadItem[];
  onCancel?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
  onPause?: (uploadId: string) => void;
  onResume?: (uploadId: string) => void;
  className?: string;
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

  return (
    <div className={cn('space-y-3 rounded-lg border border-slate-200 bg-white p-4', className)}>
      <h3 className="text-sm font-semibold text-slate-900">Uploads</h3>
      <ul className="space-y-3">
        {uploads.map((upload) => (
          <li key={upload.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{upload.fileName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(upload.size)} · {upload.status}
                </p>
              </div>
              <div className="flex items-center gap-1">
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
                {(upload.status === 'uploading' || upload.status === 'paused') && onCancel ? (
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
            <Progress value={upload.progress} />
            {upload.error ? <p className="text-xs text-red-600">{upload.error}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
