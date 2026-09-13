import { type InputHTMLAttributes } from 'react';
import { cn } from '../lib/utils.js';

export function Input({
  className,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'vs-form-control flex min-h-11 w-full cursor-text rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 transition-[border-color,background-color] duration-200 placeholder:text-slate-400 outline-none hover:border-slate-300 focus:border-slate-900 focus:outline-none focus-visible:border-slate-900 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50/30 aria-[invalid=true]:focus:border-red-600 sm:text-sm',
        className,
      )}
      {...props}
    />
  );
}
