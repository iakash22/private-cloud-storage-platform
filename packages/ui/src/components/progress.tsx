import { type HTMLAttributes } from 'react';
import { cn } from '../lib/utils.js';

export function Progress({ value, className, ...props }: HTMLAttributes<HTMLDivElement> & { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-slate-900 transition-all duration-200"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
