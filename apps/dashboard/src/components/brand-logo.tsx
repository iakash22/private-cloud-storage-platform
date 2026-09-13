import { cn } from '@vaultstack/ui';

export interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
  label?: string;
}

const SIZE_MAP = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
} as const;

const SVG_SIZE = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const;

export function BrandLogo({
  size = 'md',
  animated = true,
  className,
  label = 'VaultStack',
}: BrandLogoProps) {
  const gradientId = `vsLogoGrad-${size}`;

  return (
    <span className={cn('vs-brand-logo', className)} role="img" aria-label={label}>
      {animated ? <span className="vs-brand-logo__ring" aria-hidden="true" /> : null}
      <span className={cn('vs-brand-logo__mark', SIZE_MAP[size])}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 64 64"
          className={SVG_SIZE[size]}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="8" y1="8" x2="56" y2="56">
              <stop stopColor="#38bdf8" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <path
            d="M18 20.5 32 14l14 6.5v9.2c0 9.3-5.6 16.3-14 20.3-8.4-4-14-11-14-20.3v-9.2Z"
            fill={`url(#${gradientId})`}
          />
          <path
            className={animated ? 'vs-brand-logo__check' : undefined}
            d="m24 31 5.2 5.2L40.5 25"
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
        </svg>
      </span>
    </span>
  );
}
