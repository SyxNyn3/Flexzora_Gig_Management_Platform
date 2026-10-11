import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ImportRow, ImportRowStatus } from '@/lib/types';
import { ImportTargetDef } from '@/lib/import/targets';
import { validateRow } from '@/lib/import/mapping';
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle, Download, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_RENDERED = 200;

const STATUS_META: Record<ImportRowStatus, { label: string; icon: React.ReactNode; tone: string }> = {
  pending: { label: 'pending', icon: <MinusCircle className="w-3.5 h-3.5" />, tone: 'text-muted-foreground' },
  ready: { label: 'ready', icon: <CheckCircle2 className="w-3.5 h-3.5" />, tone: 'text-emerald-600 dark:text-emerald-400' },
  warning: { label: 'warning', icon: <AlertTriangle className="w-3.5 h-3.5" />, tone: 'text-amber-600 dark:text-amber-400' },
  error: { label: 'error', icon: <XCircle className="w-3.5 h-3.5" />, tone: 'text-destructive' },
  skipped: { label: 'skipped', icon: <MinusCircle className="w-3.5 h-3.5" />, tone: 'text-muted-foreground' },
  imported: { label: 'imported', icon: <CheckCircle2 className="w-3.5 h-3.5" />, tone: 'text-primary' },
};

type Filter = 'all' | 'ready' | 'warning' | 'error' | 'skipped' | 'imported';

interface Props {
  target: ImportTargetDef;
  rows: ImportRow[];
  committed: boolean;
  committing: boolean;
  onRowsChanged: (rows: ImportRow[], dirty: ImportRow[]) => void;
  onCommit: () => void;
  onExportErrors: () => void;
}

const ReviewGrid: React.FC<Props> = ({ target, rows, committed, committing, onRowsChanged, onCommit, onExportErrors }) => {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)).slice(0, MAX_RENDERED),
    [rows, filter],
  );

  const importable = counts['ready'] ?? 0;
  const warnings = counts['warning'] ?? 0;
  const errors = counts['error'] ?? 0;

  const updateRow = (id: string, mutate: (row: ImportRow) => ImportRow) => {
    let dirty: ImportRow | null = null;
    const next = rows.map((r) => {
      if (r.id !== id) return r;
      dirty = mutate(r);
      return dirty;
    });
    onRowsChanged(next, dirty ? [dirty] : []);
  };

  const setCell = (row: ImportRow, fieldKey: string, value: string) =>
    updateRow(row.id, (r) => {
      const mapped = { ...r.mapped, [fieldKey]: value };
      const v = validateRow(mapped, target);
      return { ...r, mapped, status: v.status, message: v.message };
    });

  const toggleSkip = (row: ImportRow, skip: boolean) =>
    updateRow(row.id, (r) => {
      if (skip) return { ...r, status: 'skipped' as ImportRowStatus, message: undefined };
      const v = validateRow(r.mapped, target);
      return { ...r, status: v.status, message: v.message };
    });

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `All ${counts.all ?? 0}` },
    { key: 'ready', label: `Ready ${counts['ready'] ?? 0}` },
    { key: 'warning', label: `Warnings ${warnings}` },
    { key: 'error', label: `Errors ${errors}` },
    { key: 'skipped', label: `Skipped ${counts['skipped'] ?? 0}` },
    ...(committed ? [{ key: 'imported' as Filter, label: `Imported ${counts['imported'] ?? 0}` }] : []),
  ];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {errors > 0 && !committed && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={onExportErrors}>
                <Download className="w-3.5 h-3.5" /> Failed rows CSV
              </Button>
            )}
            {!committed && (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-gradient-to-r from-blue-600 to-green-500"
                disabled={importable + warnings === 0 || committing}
                onClick={onCommit}
              >
                {committing ? (
                  <>Importing…</>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" /> Import {importable + warnings} rows
                  </>
                )}
              </Button>
            )}
            {committed && <Badge className="bg-emerald-600">Committed</Badge>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-28">Status</TableHead>
                {target.fields.map((f) => (
                  <TableHead key={f.key} className="min-w-32">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </TableHead>
                ))}
                <TableHead className="min-w-48">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const meta = STATUS_META[row.status];
                const skipped = row.status === 'skipped';
                const locked = committed || row.status === 'imported';
                return (
                  <TableRow key={row.id} className={cn(skipped && 'opacity-50')}>
                    <TableCell>
                      <Checkbox
                        checked={!skipped}
                        disabled={locked}
                        onCheckedChange={(v) => toggleSkip(row, v !== true)}
                        aria-label={skipped ? 'Include row' : 'Skip row'}
                      />
                    </TableCell>
                    <TableCell>
                      <span className={cn('flex items-center gap-1.5 text-xs font-medium', meta.tone)}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </TableCell>
                    {target.fields.map((f) => (
                      <TableCell key={f.key}>
                        <Input
                          value={row.mapped[f.key] ?? ''}
                          disabled={skipped || locked}
                          onChange={(e) => setCell(row, f.key, e.target.value)}
                          className={cn('h-7 text-xs border-transparent hover:border-input focus:border-input', !row.mapped[f.key] && 'text-muted-foreground')}
                          placeholder="—"
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{row.message ?? ''}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {visible.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No rows match this filter.</p>
          )}
          {rows.length > MAX_RENDERED && (
            <p className="text-center text-xs text-muted-foreground py-2 border-t border-border">
              Showing {visible.length} of {rows.length} rows — all rows import, the grid is capped for speed.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReviewGrid;
