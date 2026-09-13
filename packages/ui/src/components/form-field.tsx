import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils.js';

export function FormField({
  error,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { error?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
