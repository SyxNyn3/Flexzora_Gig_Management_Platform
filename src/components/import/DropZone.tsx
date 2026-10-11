import React, { useCallback, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileSpreadsheet, FileText, FileUp, Loader2 } from 'lucide-react';
import { kindOf } from '@/lib/import/files';
import { cn } from '@/lib/utils';

const ACCEPTED = ['.csv', '.tsv', '.txt', '.xlsx', '.pdf'];
const MAX_BYTES = 8 * 1024 * 1024;

interface Props {
  busy: boolean;
  onFile: (file: File) => void;
  onReject: (reason: string) => void;
}

const DropZone: React.FC<Props> = ({ busy, onFile, onReject }) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const accept = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      const kind = kindOf(file.name);
      if (!kind) return onReject(`"${file.name}" isn't a CSV, XLSX or PDF`);
      if (file.size > MAX_BYTES) return onReject(`"${file.name}" is over 8 MB`);
      onFile(file);
    },
    [onFile, onReject],
  );

  return (
    <Card
      className={cn(
        'border-2 border-dashed transition-colors cursor-pointer',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        busy && 'pointer-events-none opacity-70',
      )}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        accept(e.dataTransfer.files?.[0]);
      }}
    >
      <CardContent className="p-8 text-center">
        {busy ? (
          <>
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="font-medium">Reading your file…</p>
            <p className="text-sm text-muted-foreground mt-1">Extracting columns and rows</p>
          </>
        ) : (
          <>
            <div className="flex justify-center gap-3 mb-3 text-muted-foreground">
              <FileUp className="w-8 h-8" />
              <FileSpreadsheet className="w-8 h-8" />
              <FileText className="w-8 h-8" />
            </div>
            <p className="font-medium">Drop a crew sheet, call sheet or venue list</p>
            <p className="text-sm text-muted-foreground mt-1">CSV, XLSX or PDF — up to 8 MB. Or click to browse.</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </CardContent>
    </Card>
  );
};

export default DropZone;
