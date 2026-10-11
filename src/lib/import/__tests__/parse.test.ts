import { describe, expect, it } from 'vitest';
import {
  gridToTable,
  joinListValue,
  normalizeDateTime,
  normalizeForKind,
  normalizeInteger,
  normalizeMoney,
  parseCsvTable,
  parseDelimited,
  sniffDelimiter,
  splitListValue,
} from '../parse';

describe('sniffDelimiter', () => {
  it('picks comma for a normal CSV', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',');
  });
  it('picks tab for a TSV export', () => {
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
  it('picks semicolon for EU exports', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
  });
  it('defaults to comma on a single-column file', () => {
    expect(sniffDelimiter('only\ncolumn')).toBe(',');
  });
});

describe('parseDelimited', () => {
  it('parses a simple grid', () => {
    expect(parseDelimited('a,b\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('handles quoted cells with embedded commas', () => {
    expect(parseDelimited('"Smith, John",42', ',')).toEqual([['Smith, John', '42']]);
  });
  it('handles escaped double quotes', () => {
    expect(parseDelimited('"say ""hi""",x', ',')).toEqual([['say "hi"', 'x']]);
  });
  it('handles newlines inside quoted cells', () => {
    expect(parseDelimited('"line1\nline2",b', ',')).toEqual([['line1\nline2', 'b']]);
  });
  it('skips fully empty rows', () => {
    expect(parseDelimited('a,b\n,,\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('gridToTable / parseCsvTable', () => {
  it('uses the first row as header', () => {
    const t = parseCsvTable('Name,Rate\nAlex,52');
    expect(t.columns).toEqual(['Name', 'Rate']);
    expect(t.rows[0]).toEqual({ Name: 'Alex', Rate: '52' });
  });
  it('names blank headers and dedupes repeats', () => {
    const t = gridToTable([
      ['A', '', 'A'],
      ['1', '2', '3'],
    ]);
    expect(t.columns).toEqual(['A', 'column_2', 'A_2']);
    expect(t.rows[0]['A_2']).toBe('3');
  });
  it('pads short rows with empty cells', () => {
    const t = parseCsvTable('A,B,C\n1,2');
    expect(t.rows[0]).toEqual({ A: '1', B: '2', C: '' });
  });
});

describe('value normalization', () => {
  it('strips currency marks from money', () => {
    expect(normalizeMoney('$1,234.50')).toBe('1234.50');
    expect(normalizeMoney('52.00')).toBe('52.00');
  });
  it('normalizes integers', () => {
    expect(normalizeInteger('1,000')).toBe('1000');
    expect(normalizeInteger('4')).toBe('4');
  });
  it('joins and splits list values with the safe separator', () => {
    const joined = joinListValue(['ETCP_ARENA', 'OSHA_30']);
    expect(joined).toBe('ETCP_ARENA\x1fOSHA_30');
    expect(splitListValue('ETCP_ARENA, OSHA_30; FALL_PROTECT')).toEqual(['ETCP_ARENA', 'OSHA_30', 'FALL_PROTECT']);
  });
  it('normalizes common datetime formats', () => {
    expect(normalizeDateTime('2026-10-12 08:00')).toMatch(/^2026-10-12 \d{2}:\d{2}$/);
    expect(normalizeDateTime('10/12/2026 8:00')).toBe('2026-10-12 08:00');
    expect(normalizeDateTime('5pm')).toBe('17:00');
    expect(normalizeDateTime('12am')).toBe('00:00');
    expect(normalizeDateTime('17:30')).toBe('17:30');
    expect(normalizeDateTime('not a date')).toBe('');
  });
  it('routes values through field kinds', () => {
    expect(normalizeForKind('$34.00', 'money')).toBe('34.00');
    expect(normalizeForKind('ETCP, OSHA', 'list')).toBe('ETCP\x1fOSHA');
    expect(normalizeForKind('  padded  ', 'text')).toBe('padded');
  });
});
