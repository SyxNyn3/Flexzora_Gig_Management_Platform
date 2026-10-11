import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ImportTargetDef } from '@/lib/import/targets';
import { ColumnMapping } from '@/lib/import/mapping';
import { Sparkles, Wand2 } from 'lucide-react';

const SKIP = '__skip__';

interface Props {
  target: ImportTargetDef;
  columns: string[];
  sampleRows: Record<string, string>[];
  mapping: ColumnMapping;
  confidence: Record<string, number>;
  mappingSource: 'llm' | 'heuristic' | 'manual';
  onChange: (mapping: ColumnMapping) => void;
}

const MappingPanel: React.FC<Props> = ({ target, columns, sampleRows, mapping, confidence, mappingSource, onChange }) => {
  const sampleFor = (column: string | undefined) => {
    if (!column) return null;
    for (const row of sampleRows.slice(0, 3)) {
      const v = (row[column] ?? '').trim();
      if (v) return v.length > 28 ? `${v.slice(0, 28)}…` : v;
    }
    return null;
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="font-medium">Map columns to {target.label.toLowerCase()} fields</h3>
            <p className="text-xs text-muted-foreground">Only mapped fields import — tweak anything the guesser got wrong.</p>
          </div>
          <Badge variant="outline" className="gap-1">
            {mappingSource === 'llm' ? <Sparkles className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
            {mappingSource === 'llm' ? 'AI mapped' : 'Auto-mapped'}
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">Field</TableHead>
              <TableHead className="w-64">Source column</TableHead>
              <TableHead>Sample values</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {target.fields.map((field) => {
              const column = mapping[field.key];
              const conf = confidence[field.key];
              return (
                <TableRow key={field.key}>
                  <TableCell>
                    <span className="font-medium">{field.label}</span>
                    {field.required && <span className="text-destructive"> *</span>}
                    {field.hint && <p className="text-xs text-muted-foreground mt-0.5">{field.hint}</p>}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={column ?? SKIP}
                      onValueChange={(v) => {
                        const next = { ...mapping };
                        if (v === SKIP) delete next[field.key];
                        else next[field.key] = v;
                        onChange(next);
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>— skip —</SelectItem>
                        {columns.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{sampleFor(column) ?? '—'}</span>
                      {column && conf != null && conf >= 70 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {conf}%
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default MappingPanel;
