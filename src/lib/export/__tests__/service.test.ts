import { describe, expect, it } from 'vitest';
import { buildCrewListRows, buildScheduleRows, buildStaffRows } from '@/lib/export/service';
import type { ExportData } from '@/lib/export/service';
import { toCsv } from '@/lib/export/csv';

const data: ExportData = {
  from: '2026-11-01',
  to: '2026-11-30',
  shifts: [
    {
      event_name: 'Metro Gala', event_id: 'e1', timezone: 'America/Chicago',
      shift_title: 'Audio rig', role_name: 'A1',
      starts_at: '2026-11-10T14:00:00Z', ends_at: '2026-11-10T22:00:00Z',
      headcount: 2, hourly_rate: 55,
      crew: [
        { name: 'Rae Wells', email: 'rae@x.com', phone: '555-1', status: 'confirmed' },
        { name: 'Jon Do', email: 'jon@x.com', status: 'offered' },
      ],
    },
    {
      event_name: 'Metro Gala', event_id: 'e1', timezone: 'America/Chicago',
      shift_title: 'Stagehands', role_name: 'Hand',
      starts_at: '2026-11-10T10:00:00Z', ends_at: '2026-11-10T18:00:00Z',
      headcount: 4, hourly_rate: 30,
      crew: [{ name: 'Rae Wells', email: 'rae@x.com', status: 'confirmed' }],
    },
  ],
  staff: [
    {
      event_name: 'Metro Gala', event_id: 'e1', member_name: 'Pat PM',
      member_email: 'pat@co.com', member_phone: '555-9',
      role_label: 'PM', call_time: '2026-11-10T08:00:00Z', status: 'confirmed',
    },
  ],
};

describe('buildCrewListRows', () => {
  it('merges the same worker across shifts into one row', () => {
    const { headers, rows } = buildCrewListRows(data);
    expect(headers).toEqual(['Name', 'Email', 'Phone', 'Calls', 'Roles', 'Events']);
    expect(rows).toHaveLength(2);
    const rae = rows.find((r) => r[0] === 'Rae Wells');
    expect(rae?.[3]).toBe(2);
    expect(rae?.[4]).toBe('A1; Hand');
  });
});

describe('buildScheduleRows', () => {
  it('emits one row per call plus staff rows', () => {
    const { rows } = buildScheduleRows(data);
    // 2 shifts + 1 staff
    expect(rows).toHaveLength(3);
    const staffRow = rows.find((r) => String(r[3]).startsWith('Staff'));
    expect(staffRow?.[6]).toBe('Pat PM');
  });

  it('marks unfilled calls', () => {
    const empty: ExportData = { ...data, shifts: [{ ...data.shifts[0], crew: [] }], staff: [] };
    const { rows } = buildScheduleRows(empty);
    expect(rows[0][6]).toBe('(unfilled)');
  });
});

describe('buildStaffRows', () => {
  it('includes member contact info', () => {
    const { rows } = buildStaffRows(data);
    expect(rows[0]).toContain('pat@co.com');
  });
});

describe('toCsv', () => {
  it('escapes quotes and commas', () => {
    const csv = toCsv(['A', 'B'], [['say "hi"', 'x,y']]);
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"x,y"');
  });

  it('handles null as empty', () => {
    expect(toCsv(['A'], [[null]])).toContain('A\r\n');
  });
});
