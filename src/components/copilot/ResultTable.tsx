// Generic readout for copilot_query rows — formats dates/money, caps render.
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MONEY_KEYS = /pay|rate|labor|cap|fee|cost|budget|gross/i;
const DATE_KEYS = /_at$|_on$|date/i;

function formatCell(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (MONEY_KEYS.test(key) && !Number.isNaN(Number(value))) {
    return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (DATE_KEYS.test(key) && typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const LABEL_OVERRIDES: Record<string, string> = {
  shift_id: 'shift', event_id: 'event', worker_id: 'worker', timesheet_id: 'timesheet',
  assignment_id: 'assignment', budget_cap: 'budget cap', platform_fee_pct: 'fee %',
  projected_labor: 'projected labor', booked_labor: 'booked labor', approved_pay: 'approved pay',
};
const HIDDEN_KEYS = new Set(['shift_id', 'event_id', 'worker_id', 'timesheet_id', 'assignment_id']);

const ResultTable: React.FC<{ rows: Record<string, unknown>[] }> = ({ rows }) => {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]).filter((k) => !HIDDEN_KEYS.has(k));
  const shown = rows.slice(0, 15);
  return (
    <div className="rounded-md border overflow-x-auto mt-2">
      <Table>
        <TableHeader>
          <TableRow>
            {keys.map((k) => (
              <TableHead key={k} className="whitespace-nowrap text-xs">
                {LABEL_OVERRIDES[k] ?? k.replace(/_/g, ' ')}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, i) => (
            <TableRow key={i}>
              {keys.map((k) => (
                <TableCell key={k} className="whitespace-nowrap text-xs py-1.5">
                  {formatCell(k, row[k])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > shown.length && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">…and {rows.length - shown.length} more</div>
      )}
    </div>
  );
};

export default ResultTable;
