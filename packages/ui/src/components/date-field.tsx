import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils.js';
import { Button } from './button.js';

export interface DateFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function buildCells(month: Date): Array<{ date: Date; inMonth: boolean }> {
  const first = startOfMonth(month);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}

export function DateField({
  id,
  value,
  onChange,
  className,
  disabled = false,
}: DateFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseDate(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    if (selected) {
      setViewMonth(startOfMonth(selected));
    }
  }, [selected]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const cells = useMemo(() => buildCells(viewMonth), [viewMonth]);
  const monthLabel = viewMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const display = selected
    ? selected.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Pick a date';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'vs-form-control flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-slate-300 focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/80 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
          open && 'border-slate-400 ring-2 ring-slate-300/80 ring-offset-2',
        )}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className={cn('truncate', !selected && 'text-slate-400')}>{display}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date"
          className="vs-menu-enter absolute z-40 mt-2 w-[19.5rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold text-slate-900">{monthLabel}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
                aria-label="Previous month"
                onClick={() => {
                  setViewMonth((current) => addMonths(current, -1));
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
                aria-label="Next month"
                onClick={() => {
                  setViewMonth((current) => addMonths(current, 1));
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map(({ date, inMonth }) => {
              const key = formatDate(date);
              const isSelected = value === key;
              const isToday = formatDate(new Date()) === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors duration-150',
                    !inMonth && 'text-slate-300',
                    inMonth && !isSelected && 'text-slate-700 hover:bg-slate-100',
                    isToday && !isSelected && 'ring-1 ring-sky-300',
                    isSelected && 'bg-slate-900 font-semibold text-white shadow-sm',
                  )}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const today = formatDate(new Date());
                onChange(today);
                setViewMonth(startOfMonth(new Date()));
                setOpen(false);
              }}
            >
              Today
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
