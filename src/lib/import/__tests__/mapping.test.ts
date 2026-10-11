import { describe, expect, it } from 'vitest';
import { applyMapping, failedRowsCsv, suggestMapping } from '../mapping';
import { IMPORT_TARGETS, importTarget } from '../targets';

const venues = importTarget('venues')!;
const shifts = importTarget('shifts')!;
const roster = importTarget('roster_contacts')!;

describe('suggestMapping', () => {
  it('maps obvious venue headers exactly', () => {
    const columns = ['Venue', 'Address', 'City', 'Lat', 'Lng'];
    const rows = [{ Venue: 'Demo Stadium', Address: '1 Stadium Way', City: 'SF', Lat: '37.77', Lng: '-122.41' }];
    const { mapping } = suggestMapping(columns, rows, venues);
    expect(mapping.name).toBe('Venue');
    expect(mapping.address).toBe('Address');
    expect(mapping.city).toBe('City');
    expect(mapping.latitude).toBe('Lat');
    expect(mapping.longitude).toBe('Lng');
  });

  it('maps a call-sheet with alias headers', () => {
    const columns = ['Position', 'Crew', 'Call Time', 'Wrap', 'Rate'];
    const rows = [{ Position: 'Stagehand', Crew: '6', 'Call Time': '2026-10-12 08:00', Wrap: '2026-10-12 18:00', Rate: '44.00' }];
    const { mapping } = suggestMapping(columns, rows, shifts);
    expect(mapping.role_name).toBe('Position');
    expect(mapping.headcount).toBe('Crew');
    expect(mapping.starts_at).toBe('Call Time');
    expect(mapping.ends_at).toBe('Wrap');
    expect(mapping.hourly_rate).toBe('Rate');
  });

  it('sniffs an email column when the header is cryptic', () => {
    const columns = ['col_a', 'col_b'];
    const rows = [
      { col_a: 'Alex Moreno', col_b: 'alex@example.com' },
      { col_a: 'Jordan Kim', col_b: 'jordan@example.com' },
    ];
    const { mapping } = suggestMapping(columns, rows, roster);
    expect(mapping.email).toBe('col_b');
    expect(mapping.full_name).toBe('col_a');
  });

  it('never assigns one source column to two fields', () => {
    const columns = ['Rate', 'Hourly Rate'];
    const rows = [{ Rate: '44', 'Hourly Rate': '44' }];
    const { mapping } = suggestMapping(columns, rows, shifts);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });

  it('leaves unmatchable fields unmapped', () => {
    const { mapping } = suggestMapping(['zzz'], [{ zzz: 'x' }], venues);
    expect(mapping.address).toBeUndefined();
  });
});

describe('applyMapping + validateRow', () => {
  it('normalizes money and lists, flags missing required fields', () => {
    const rows = [{ Title: 'Load-in', Role: 'Rigger', 'Certs Needed': 'ETCP_ARENA, OSHA_30', Count: '4', Start: '2026-10-12 08:00', End: '2026-10-12 18:00', Pay: '$52.00' }];
    const mapping = {
      title: 'Title',
      role_name: 'Role',
      required_cert_codes: 'Certs Needed',
      headcount: 'Count',
      starts_at: 'Start',
      ends_at: 'End',
      hourly_rate: 'Pay',
    };
    const [row] = applyMapping(rows, mapping, shifts);
    expect(row.status).toBe('ready');
    expect(row.mapped.hourly_rate).toBe('52.00');
    expect(row.mapped.required_cert_codes).toBe('ETCP_ARENA\x1fOSHA_30');
  });

  it('errors when a required field is missing', () => {
    const [row] = applyMapping([{ Venue: 'X' }], { name: 'Venue' }, venues);
    expect(row.status).toBe('error');
    expect(row.message).toMatch(/Missing Street address/);
  });

  it('warns when a venue has no coordinates', () => {
    const [row] = applyMapping([{ V: 'Arena', A: '1 Main St' }], { name: 'V', address: 'A' }, venues);
    expect(row.status).toBe('warning');
    expect(row.message).toMatch(/coordinates/);
  });

  it('errors when wrap is before call', () => {
    const [row] = applyMapping(
      [{ T: 'Call', R: 'Deck', C: '4', S: '2026-10-12 18:00', E: '2026-10-12 08:00', P: '44' }],
      { title: 'T', role_name: 'R', headcount: 'C', starts_at: 'S', ends_at: 'E', hourly_rate: 'P' },
      shifts,
    );
    expect(row.status).toBe('error');
    expect(row.message).toMatch(/Wrap time/);
  });

  it('prefixes time-only call times with the event date', () => {
    const [row] = applyMapping(
      [{ T: 'Call', R: 'Deck', C: '4', S: '8am', E: '6pm', P: '44' }],
      { title: 'T', role_name: 'R', headcount: 'C', starts_at: 'S', ends_at: 'E', hourly_rate: 'P' },
      shifts,
      { datePrefix: '2026-10-12' },
    );
    expect(row.mapped.starts_at).toBe('2026-10-12 08:00');
    expect(row.mapped.ends_at).toBe('2026-10-12 18:00');
    expect(row.status).toBe('ready');
  });
});

describe('failedRowsCsv', () => {
  it('exports only error rows, escaping commas', () => {
    const rows = applyMapping(
      [
        { V: 'Arena, North', A: '1 Main St' },
        { V: 'B, South Lot' },
      ],
      { name: 'V', address: 'A' },
      venues,
    );
    const csv = failedRowsCsv(rows, ['V', 'A']);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('V,A');
    expect(lines).toHaveLength(2); // only the error row
    expect(lines[1]).toBe('"B, South Lot",');
  });
});

describe('target registry sanity', () => {
  it('every importable target has fields and aliases', () => {
    for (const t of IMPORT_TARGETS.filter((t) => !t.comingSoon)) {
      expect(t.fields.length).toBeGreaterThan(0);
      for (const f of t.fields) {
        expect(f.key).toBeTruthy();
        expect(f.aliases.length).toBeGreaterThan(0);
      }
    }
  });
});
