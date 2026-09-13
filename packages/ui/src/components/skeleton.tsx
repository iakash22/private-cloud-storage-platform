import { type HTMLAttributes } from 'react';
import { cn } from '../lib/utils.js';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('vs-skeleton animate-pulse rounded-md bg-slate-200/90', className)}
      {...props}
    />
  );
}
