export interface ExplorerEntry {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  key: string;
  size?: number;
  contentType?: string;
  updatedAt?: string;
  favorite?: boolean;
}

export interface FileTableProps {
  entries: ExplorerEntry[];
  selectedId?: string;
  onSelect: (entry: ExplorerEntry) => void;
  onOpen: (entry: ExplorerEntry) => void;
  onDownload?: (entry: ExplorerEntry) => void;
  onRename?: (entry: ExplorerEntry) => void;
  onDelete?: (entry: ExplorerEntry) => void;
  onToggleFavorite?: (entry: ExplorerEntry) => void;
}

export type FileGridProps = FileTableProps;
