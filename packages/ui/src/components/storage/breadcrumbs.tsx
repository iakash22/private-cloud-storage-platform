import { ChevronRight } from 'lucide-react';
import { breadcrumbSegments } from '../../lib/storage-utils.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../button.js';

export interface BreadcrumbsProps {
  prefix: string;
  onNavigate: (prefix: string) => void;
  className?: string;
}

export function Breadcrumbs({ prefix, onNavigate, className }: BreadcrumbsProps) {
  const segments = breadcrumbSegments(prefix);

  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1 text-sm', className)}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;

        return (
          <span key={segment.prefix || 'root'} className="inline-flex items-center gap-1">
            {index > 0 ? <ChevronRight aria-hidden className="h-4 w-4 text-slate-400" /> : null}
            {isLast ? (
              <span aria-current="page" className="font-medium text-slate-900">
                {segment.label}
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-none bg-transparent px-2 text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  onNavigate(segment.prefix);
                }}
              >
                {segment.label}
              </Button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
