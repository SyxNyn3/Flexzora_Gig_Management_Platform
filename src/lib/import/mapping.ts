// Column mapping + row validation for the upload wizard.
//
// suggestMapping() is the heuristic fallback when the LLM endpoint is
// unreachable — and it's also the pre-seed the LLM result is merged over
// (user edits always win last). Scoring: exact alias hit 100, substring 80,
// sample-value sniff 60, unique-kind sniff 70. Greedy assignment, one
// source column per field.
//
// validateRows() mirrors what commit_import_job enforces server-side so the
// review screen shows the same verdict the DB would give.
import { FieldDef, ImportTargetDef } from './targets';
import { normalizeForKind } from './parse';
import { ImportRowStatus } from '@/lib/types';

export type ColumnMapping = Record<string, string>; // field key -> source column

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
// Value sniffers — what does this column's data look like?
// ---------------------------------------------------------------------------
const SNIFFERS: Record<string, (v: string) => boolean> = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => /^[+()\-.\s\d]{7,20}$/.test(v) && (v.match(/\d/g) ?? []).length >= 7,
  money: (v) => /^[$€£]?\s?\d{1,3}([,.\s]?\d{3})*(\.\d{1,2})?$/.test(v.trim()) || /^[$€£]\s*\d+(\.\d{1,2})?$/.test(v.trim()),
  integer: (v) => /^\d{1,4}$/.test(v.trim()),
  number: (v) => /^-?\d+(\.\d+)?$/.test(v.trim()),
  datetime: (v) => !Number.isNaN(new Date(v).getTime()) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v) || /\d{1,2}:\d{2}/.test(v),
  date: (v) => !Number.isNaN(new Date(v).getTime()) || /^\d{4}-\d{2}-\d{2}/.test(v),
  name: (v) => /^[A-Za-z][A-Za-z .,'-]{1,60}$/.test(v.trim()) && v.trim().includes(' '),
  address: (v) => /\d+\s+\w+\s+\w+/.test(v) && v.length > 8,
};

function sniffColumn(column: string, rows: Record<string, string>[]): string[] {
  const hits = new Map<string, number>();
  let sampled = 0;
  for (const row of rows.slice(0, 25)) {
    const v = (row[column] ?? '').trim();
    if (!v) continue;
    sampled += 1;
    for (const [kind, test] of Object.entries(SNIFFERS)) {
      if (test(v)) hits.set(kind, (hits.get(kind) ?? 0) + 1);
    }
  }
  if (sampled === 0) return [];
  return [...hits.entries()].filter(([, n]) => n >= Math.ceil(sampled * 0.6)).map(([k]) => k);
}

export interface MappingSuggestion {
  mapping: ColumnMapping;
  /** field -> 0-100 confidence, for the auto-mapped badges. */
  confidence: Record<string, number>;
  source: 'heuristic';
}

export function suggestMapping(columns: string[], rows: Record<string, string>[], target: ImportTargetDef): MappingSuggestion {
  const candidates: { field: string; column: string; score: number }[] = [];
  const sniffCache = new Map<string, string[]>();
  const sniffsFor = (column: string) => {
    if (!sniffCache.has(column)) sniffCache.set(column, sniffColumn(column, rows));
    return sniffCache.get(column)!;
  };

  for (const field of target.fields) {
    for (const column of columns) {
      const nc = norm(column);
      let score = 0;
      if (field.aliases.some((a) => norm(a) === nc)) score = 100;
      else if (field.aliases.some((a) => nc.includes(norm(a)) || (norm(a).includes(nc) && nc.length > 2))) score = 80;
      if (score < 80 && field.sniff) {
        const kinds = sniffsFor(column);
        if (kinds.includes(field.sniff)) {
          // Value-sniffed match: stronger when it's the only column of that kind.
          const siblings = columns.filter((c) => sniffsFor(c).includes(field.sniff!)).length;
          score = siblings === 1 ? 70 : 60;
        }
      }
      if (score > 0) candidates.push({ field: field.key, column, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const mapping: ColumnMapping = {};
  const confidence: Record<string, number> = {};
  const usedColumns = new Set<string>();
  const usedFields = new Set<string>();
  for (const c of candidates) {
    if (usedColumns.has(c.column) || usedFields.has(c.field)) continue;
    mapping[c.field] = c.column;
    confidence[c.field] = c.score;
    usedColumns.add(c.column);
    usedFields.add(c.field);
  }
  return { mapping, confidence, source: 'heuristic' };
}

// ---------------------------------------------------------------------------
// Apply + validate
// ---------------------------------------------------------------------------

export interface ReviewedRow {
  row_index: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  status: ImportRowStatus;
  message?: string;
}

function requiredMissing(field: FieldDef, mapped: Record<string, string>): boolean {
  return Boolean(field.required) && !(mapped[field.key] ?? '').trim();
}

function formatProblems(field: FieldDef, value: string): string | null {
  if (!value) return null;
  switch (field.kind) {
    case 'money':
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(value) ? null : `“${value}” isn't a number`;
    case 'integer':
      return /^-?\d+$/.test(value) ? null : `“${value}” isn't a whole number`;
    case 'email':
      // A roster contact may be a username instead of an email — only flag
      // values that look like a mangled email (has @ but doesn't parse).
      return value.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `“${value}” isn't a valid email` : null;
    case 'datetime':
      return value.length < 4 ? `“${value}” isn't a date/time` : null;
    default:
      return null;
  }
}

/**
 * Apply the column mapping to raw rows and validate each one.
 * `defaults.datePrefix` turns time-only call times into the event's date.
 */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  target: ImportTargetDef,
  defaults: { datePrefix?: string } = {},
): ReviewedRow[] {
  return rows.map((raw, row_index) => {
    const mapped: Record<string, string> = {};
    for (const field of target.fields) {
      const column = mapping[field.key];
      if (!column) continue;
      const rawValue = raw[column];
      let normalized = normalizeForKind(rawValue ?? '', field.kind);
      if (defaults.datePrefix && field.kind === 'datetime' && /^\d{2}:\d{2}$/.test(normalized)) {
        normalized = `${defaults.datePrefix} ${normalized}`;
      }
      if (normalized || (rawValue ?? '').trim()) mapped[field.key] = normalized;
      else if ((rawValue ?? '').trim()) mapped[field.key] = '';
    }
    const { status, message } = validateRow(mapped, target, raw);
    return { row_index, raw, mapped, status, message };
  });
}

export function validateRow(
  mapped: Record<string, string>,
  target: ImportTargetDef,
  _raw?: Record<string, string>,
): { status: ImportRowStatus; message?: string } {
  const missing = target.fields.filter((f) => requiredMissing(f, mapped));
  if (missing.length > 0) {
    return { status: 'error', message: `Missing ${missing.map((f) => f.label).join(', ')}` };
  }
  for (const field of target.fields) {
    const problem = formatProblems(field, (mapped[field.key] ?? '').trim());
    if (problem) return { status: 'error', message: `${field.label}: ${problem}` };
  }

  // Target-specific warnings — importable but worth telling Dana about.
  if (target.key === 'venues' && !(mapped.latitude || '').trim()) {
    return { status: 'warning', message: 'No coordinates — GPS clock-in will run unverified until you add them' };
  }
  if (target.key === 'shifts') {
    const start = new Date((mapped.starts_at ?? '').replace(' ', 'T'));
    const end = new Date((mapped.ends_at ?? '').replace(' ', 'T'));
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      return { status: 'error', message: 'Wrap time is before call time' };
    }
  }
  return { status: 'ready' };
}

/** CSV of failed rows for the fix-and-retry loop. */
export function failedRowsCsv(rows: ReviewedRow[], columns: string[]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns.map(escape).join(',')];
  for (const r of rows.filter((r) => r.status === 'error')) {
    lines.push(columns.map((c) => escape(r.raw[c] ?? '')).join(','));
  }
  return lines.join('\n');
}
