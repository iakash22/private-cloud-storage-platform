import { type CSSProperties, type ReactNode } from 'react';
import { cn } from '../lib/utils.js';

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message?.trim()) {
    return null;
  }

  return (
    <p
      id={id}
      className="vs-success-pop text-sm font-medium text-red-600"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

export function FormField({
  children,
  error,
  className,
  style,
}: {
  children: ReactNode;
  error?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn('vs-form-field space-y-2', className)}
      data-invalid={error ? 'true' : undefined}
      style={style}
    >
      {children}
      <FieldError message={error} />
    </div>
  );
}
