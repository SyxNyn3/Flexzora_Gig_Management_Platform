// File-to-table parsing for the upload wizard.
//
// Everything here is pure (no supabase, no DOM File API beyond ArrayBuffer)
// so vitest exercises it directly. CSV is hand-rolled — quoted cells,
// escaped quotes, embedded newlines, TSV/semicolon/| delimiter sniffing.
// XLSX and PDF live in xlsx.ts / pdf.ts behind dynamic imports.

export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

const DELIMITERS = [',', ';', '\t', '|'] as const;

/** Pick the delimiter that appears most often in the first non-empty line. */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180-ish CSV: cells may be quoted, quotes inside quoted cells are
 * doubled, and quoted cells can contain newlines. Returns string[][].
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Grid -> {columns, rows}. First row is the header; blank headers get
 * "column_N" names, duplicates get suffixed. Rows keep raw cell text.
 */
export function gridToTable(grid: string[][]): ParsedTable {
  if (grid.length === 0) return { columns: [], rows: [] };
  const header = grid[0];
  const seen = new Map<string, number>();
  const columns = header.map((h, idx) => {
    const base = h.trim() || `column_${idx + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });

  const rows = grid.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    columns.forEach((col, idx) => {
      row[col] = (cells[idx] ?? '').trim();
    });
    return row;
  });
  return { columns, rows };
}

export function parseCsvTable(text: string): ParsedTable {
  return gridToTable(parseDelimited(text, sniffDelimiter(text)));
}

// ---------------------------------------------------------------------------
// Value normalization — mapped values are always plain strings the server
// casts. Money loses its currency marks, datetimes become ISO-ish strings
// Postgres accepts, lists become \x1f-joined (safe against commas/semicolons
// inside cert names).
// ---------------------------------------------------------------------------

export const LIST_SEP = '\x1f';

export function splitListValue(value: string): string[] {
  return value
    .split(/[,;|]|\band\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinListValue(tokens: string[]): string {
  return tokens.join(LIST_SEP);
}

export function normalizeMoney(value: string): string {
  const cleaned = value.replace(/[$€£,\s]/g, '');
  return cleaned;
}

/**
 * Lenient datetime -> "YYYY-MM-DD HH:MM" (24h, local interpretation) which
 * Postgres casts cleanly. Handles ISO, M/D/YYYY, "Oct 12 2026 8:00",
 * "8am", "08:00 PM", and Date objects passed through from XLSX cells.
 * Returns '' when nothing parses — the row validator flags it.
 */
export function normalizeDateTime(value: string | Date): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : toPgDateTime(value);
  }
  const v = value.trim();
  if (!v) return '';

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return toPgDateTime(d);

  // "10/12/2026 8:00" US-style with optional am/pm
  const mdy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*(.*)$/);
  if (mdy) {
    const [, m, d2, y, rest] = mdy;
    const t = parseTimePart(rest || '00:00');
    if (t) {
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      return `${year}-${pad(m)}-${pad(d2)} ${t}`;
    }
  }

  // Time only — "8am", "17:30" (date filled by the event context downstream)
  const tOnly = parseTimePart(v);
  if (tOnly) return tOnly;
  return '';
}

function parseTimePart(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? '00';
  const mer = m[3]?.replace(/\./g, '').toLowerCase();
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h > 23 || Number(min) > 59) return null;
  return `${pad(h)}:${min}`;
}

function pad(n: string | number): string {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s;
}

function toPgDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function normalizeInteger(value: string): string {
  const m = value.replace(/[,\s]/g, '').match(/^-?\d+/);
  return m ? m[0] : '';
}

export function normalizeNumber(value: string): string {
  const cleaned = value.replace(/[,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : '';
}

/** Route one raw cell through its field's normalizer. */
export function normalizeForKind(value: string | Date, kind: string): string {
  if (value instanceof Date) return kind === 'date' ? normalizeDate(value) : normalizeDateTime(value);
  switch (kind) {
    case 'money':
      return normalizeMoney(value);
    case 'integer':
      return normalizeInteger(value);
    case 'number':
      return normalizeNumber(value) || normalizeMoney(value);
    case 'datetime':
      return normalizeDateTime(value);
    case 'date':
      return normalizeDate(value);
    case 'list':
      return joinListValue(splitListValue(value));
    case 'email':
      return value.trim().toLowerCase();
    default:
      return value.trim();
  }
}

export function normalizeDate(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const v = value.trim();
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mdy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (mdy) {
    const year = mdy[3].length === 2 ? 2000 + Number(mdy[3]) : Number(mdy[3]);
    return `${year}-${pad(mdy[1])}-${pad(mdy[2])}`;
  }
  return '';
}
