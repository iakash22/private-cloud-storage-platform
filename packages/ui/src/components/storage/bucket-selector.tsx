import type { PublicBucket } from '@vaultstack/types';
import { cn } from '../../lib/utils.js';
import { Label } from '../label.js';
import { Select } from '../select.js';

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
  const options =
    buckets.length === 0
      ? [{ value: '', label: 'No buckets available' }]
      : buckets.map((bucket) => ({ value: bucket.id, label: bucket.name }));

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor="bucket-selector">Bucket</Label>
      <Select
        id="bucket-selector"
        aria-label="Select bucket"
        disabled={disabled || buckets.length === 0}
        value={value ?? ''}
        onChange={onChange}
        options={options}
        placeholder="Select a bucket"
      />
    </div>
  );
}
