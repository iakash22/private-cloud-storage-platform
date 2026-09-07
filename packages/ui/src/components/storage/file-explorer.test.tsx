import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileExplorer } from './file-explorer.js';

describe('FileExplorer', () => {
  it('renders folders and files from an object list page', () => {
    render(
      <FileExplorer
        prefix=""
        page={{
          objects: [
            {
              id: 'obj-1',
              bucketId: 'bucket-1',
              key: 'readme.txt',
              size: 12,
              contentType: 'text/plain',
              etag: 'etag',
              checksumAlgorithm: 'SHA256',
              checksum: null,
              versionId: null,
              metadata: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
          prefixes: ['docs/'],
          nextCursor: null,
          isTruncated: false,
        }}
        viewMode="list"
        onViewModeChange={() => undefined}
        search=""
        onSearchChange={() => undefined}
        sortField="name"
        sortDirection="asc"
        onSortFieldChange={() => undefined}
        onSortDirectionChange={() => undefined}
        onNavigatePrefix={() => undefined}
        onSelect={() => undefined}
        onOpen={() => undefined}
        onUploadClick={() => undefined}
        onFilesSelected={() => undefined}
      />,
    );

    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText('readme.txt')).toBeInTheDocument();
  });
});
