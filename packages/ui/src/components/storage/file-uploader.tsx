import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

export function FileUploader({ onFilesSelected, disabled = false, className }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    onFilesSelected(Array.from(fileList));
  };

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-8 text-center transition',
        dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragActive(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (!disabled) {
          handleFiles(event.dataTransfer.files);
        }
      }}
    >
      <UploadCloud aria-hidden className="mx-auto mb-3 h-10 w-10 text-slate-400" />
      <p className="text-sm font-medium text-slate-900">Drag and drop files here</p>
      <p className="mt-1 text-sm text-slate-500">or choose files from your device</p>
      <button
        type="button"
        disabled={disabled}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-label="Choose files to upload"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
