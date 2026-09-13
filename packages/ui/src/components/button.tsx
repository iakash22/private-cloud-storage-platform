import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { type ButtonHTMLAttributes, type MouseEvent, useState } from 'react';
import { cn } from '../lib/utils.js';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center rounded-lg text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-slate-900 text-white shadow-sm hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md focus-visible:ring-slate-400',
        outline:
          'border border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm focus-visible:ring-slate-300',
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-11 min-h-11 rounded-lg px-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  loadingLabel?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingLabel,
  onClick,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const [promisePending, setPromisePending] = useState(false);
  const isLoading = loading || promisePending;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const result = onClick?.(event);
    if (isPromiseLike(result)) {
      setPromisePending(true);
      void Promise.resolve(result).finally(() => setPromisePending(false));
    }
  };

  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      onClick={handleClick}
    >
      {isLoading ? (
        <>
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          {loadingLabel ?? 'Working…'}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export { buttonVariants };
