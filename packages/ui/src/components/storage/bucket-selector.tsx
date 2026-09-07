import type { PublicBucket } from '@vaultstack/types';
import { cn } from '../../lib/utils.js';
import { Label } from '../label.js';

export interface BucketSelectorProps {
  buckets: PublicBucket[];
  value?: string;
  onChange: (bucketId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function BucketSelector({
  buckets,
  value,
  onChange,
  disabled = false,
  className,
}: BucketSelectorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor="bucket-selector">Bucket</Label>
      <select
        id="bucket-selector"
        aria-label="Select bucket"
        disabled={disabled || buckets.length === 0}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {buckets.length === 0 ? <option value="">No buckets available</option> : null}
        {buckets.map((bucket) => (
          <option key={bucket.id} value={bucket.id}>
            {bucket.name}
          </option>
        ))}
      </select>
    </div>
  );
}
