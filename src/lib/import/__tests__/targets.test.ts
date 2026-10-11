import { describe, expect, it } from 'vitest';
import { IMPORT_TARGETS, importTarget, suggestTarget } from '../targets';

describe('suggestTarget', () => {
  it('suggests venues for an address sheet', () => {
    expect(suggestTarget(['Venue', 'Address', 'City', 'State'])?.key).toBe('venues');
  });

  it('suggests call sheets for rate/headcount columns', () => {
    expect(suggestTarget(['Role', 'Call Time', 'Wrap', 'Rate', 'Headcount'])?.key).toBe('shifts');
  });

  it('suggests roster contacts for a bare email list', () => {
    expect(suggestTarget(['Name', 'Email', 'Phone'])?.key).toBe('roster_contacts');
  });

  it('suggests staff when title/department/day-rate columns appear', () => {
    expect(suggestTarget(['Name', 'Email', 'Title', 'Department', 'Day Rate'])?.key).toBe('staff');
  });

  it('returns undefined when nothing matches', () => {
    expect(suggestTarget(['Foo', 'Bar'])).toBeUndefined();
  });
});

describe('staff target', () => {
  it('is live (not coming soon) and requires a name', () => {
    const staff = importTarget('staff');
    expect(staff).toBeDefined();
    expect(staff?.comingSoon).toBeFalsy();
    expect(staff?.fields.find((f) => f.key === 'full_name')?.required).toBe(true);
  });

  it('every target field key is unique', () => {
    for (const def of IMPORT_TARGETS) {
      const keys = def.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('shift_templates target', () => {
  it('suggests call packs for a rate-card sheet', () => {
    expect(suggestTarget(['Pack Name', 'Role', 'Duration', 'Rate'])?.key).toBe('shift_templates');
  });

  it('requires role/headcount/rate — the pack essentials', () => {
    const t = importTarget('shift_templates');
    expect(t).toBeDefined();
    for (const key of ['role_name', 'headcount', 'hourly_rate']) {
      expect(t?.fields.find((f) => f.key === key)?.required).toBe(true);
    }
    expect(t?.needsEvent).toBeFalsy();
  });
});
