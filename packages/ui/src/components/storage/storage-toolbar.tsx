import { FolderPlus, Grid3X3, List, Search, Upload } from 'lucide-react';
import type { SortDirection, SortField } from '../../lib/storage-utils.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../button.js';
import { Input } from '../input.js';
import { Select } from '../select.js';

export type ViewMode = 'list' | 'grid';

export interface StorageToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onUploadClick: () => void;
  onCreateFolder?: () => void;
  uploadDisabled?: boolean;
  className?: string;
}

export function StorageToolbar({
  search,
  onSearchChange,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
  onUploadClick,
  onCreateFolder,
  uploadDisabled = false,
  className,
}: StorageToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
    >
      <div className="relative max-w-md flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <Input
          aria-label="Search files"
          placeholder="Search files and folders"
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onCreateFolder ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCreateFolder}
            disabled={uploadDisabled}
            aria-label="Create folder"
          >
            <FolderPlus aria-hidden className="mr-2 h-4 w-4" />
            New folder
          </Button>
        ) : null}
        <label className="sr-only" htmlFor="sort-field">
          Sort by
        </label>
        <Select
          id="sort-field"
          aria-label="Sort by"
          className="w-40"
          value={sortField}
          onChange={(value) => {
            onSortFieldChange(value as SortField);
          }}
          options={[
            { value: 'name', label: 'Name' },
            { value: 'size', label: 'Size' },
            { value: 'updatedAt', label: 'Modified' },
          ]}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
          onClick={() => {
            onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
          }}
        >
          {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </Button>

        <Button
          type="button"
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
          onClick={() => {
            onViewModeChange('list');
          }}
        >
          <List aria-hidden className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={viewMode === 'grid' ? 'default' : 'outline'}
          size="sm"
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          onClick={() => {
            onViewModeChange('grid');
          }}
        >
          <Grid3X3 aria-hidden className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          onClick={onUploadClick}
          disabled={uploadDisabled}
          aria-label="Upload files"
        >
          <Upload aria-hidden className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>
    </div>
  );
}
