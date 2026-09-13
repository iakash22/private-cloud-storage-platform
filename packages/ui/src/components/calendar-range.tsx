import { CalendarDays, RotateCcw } from 'lucide-react';
import { Button } from './button.js';
import { DateField } from './date-field.js';
import { Label } from './label.js';

export interface CalendarRangeProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear?: () => void;
}

export function CalendarRange({ from, to, onFromChange, onToChange, onClear }: CalendarRangeProps) {
  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    onFromChange(formatDateInput(start));
    onToChange(formatDateInput(end));
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
        Date range
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calendar-range-from">From</Label>
          <DateField id="calendar-range-from" value={from} onChange={onFromChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-range-to">To</Label>
          <DateField id="calendar-range-to" value={to} onChange={onToChange} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Quick range</span>
        {[7, 30, 90].map((days) => (
          <Button
            key={days}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPreset(days)}
          >
            {days} days
          </Button>
        ))}
        {onClear ? (
          <Button type="button" size="sm" variant="outline" onClick={onClear}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
