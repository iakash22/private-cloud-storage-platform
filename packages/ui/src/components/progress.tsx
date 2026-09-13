import { type HTMLAttributes } from 'react';
import { cn } from '../lib/utils.js';
import { useSmoothNumber } from '../hooks/use-smooth-number.js';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  /** Show a live percentage label (smoothly animated). */
  showValue?: boolean;
  /** Soft indeterminate shimmer while waiting / finalizing. */
  indeterminate?: boolean;
}

export function Progress({
  value,
  showValue = false,
  indeterminate = false,
  className,
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const smooth = useSmoothNumber(clamped, { durationMs: 360 });
  const displayPercent = Math.round(smooth);

  return (
    <div className={cn('space-y-1.5', showValue ? 'w-full' : undefined)}>
      {showValue ? (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="sr-only">Upload progress</span>
          <span
            className="ml-auto font-semibold tabular-nums text-slate-900 transition-transform duration-300"
            aria-live="polite"
          >
            {displayPercent}%
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : displayPercent}
        aria-busy={indeterminate || undefined}
        className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)}
        {...props}
      >
        <div
          className={cn(
            'h-full rounded-full bg-slate-900 transition-[width] duration-500 ease-out',
            indeterminate && 'vs-progress-indeterminate w-1/3',
          )}
          style={indeterminate ? undefined : { width: `${smooth}%` }}
        />
      </div>
    </div>
  );
}
