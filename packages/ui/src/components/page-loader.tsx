import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/utils.js';

export function PageLoader({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-40 items-center justify-center rounded-lg border border-slate-200 bg-white',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{label}…</span>
      </div>
    </div>
  );
}
