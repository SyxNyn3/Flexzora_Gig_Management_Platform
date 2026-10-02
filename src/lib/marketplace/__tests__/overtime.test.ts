import { describe, expect, it } from 'vitest';
import { calculateShiftPay, FLSA_DEFAULT, projectedShiftCost, splitHours } from '../overtime';

const CA = { daily_ot_after_hours: 8, daily_dt_after_hours: 12, weekly_ot_after_hours: 40, ot_multiplier: 1.5, dt_multiplier: 2, minimum_call_hours: 4 };

describe('splitHours', () => {
  it('pays straight time under FLSA daily rules', () => {
    const h = splitHours('2026-10-12T08:00:00Z', '2026-10-12T18:00:00Z', 30, FLSA_DEFAULT);
    expect(h).toMatchObject({ workedHours: 9.5, regularHours: 9.5, overtimeHours: 0, doubletimeHours: 0 });
  });

  it('applies California daily OT and DT thresholds when load-out runs long', () => {
    const h = splitHours('2026-10-12T08:00:00Z', '2026-10-12T22:00:00Z', 0, CA);
    expect(h).toMatchObject({ workedHours: 14, regularHours: 8, overtimeHours: 4, doubletimeHours: 2 });
  });

  it('enforces the minimum call', () => {
    const h = splitHours('2026-10-12T08:00:00Z', '2026-10-12T10:00:00Z', 0, CA);
    expect(h.workedHours).toBe(4);
    expect(h.minimumCallApplied).toBe(true);
  });

  it('promotes hours over the weekly cap to OT', () => {
    const h = splitHours('2026-10-12T08:00:00Z', '2026-10-12T16:00:00Z', 0, { ...FLSA_DEFAULT, weekly_hours_before_shift: 36 });
    expect(h).toMatchObject({ regularHours: 4, overtimeHours: 4 });
  });

  it('rejects inverted clock times', () => {
    expect(() => splitHours('2026-10-12T16:00:00Z', '2026-10-12T08:00:00Z', 0, CA)).toThrow();
  });
});

describe('calculateShiftPay', () => {
  it('computes gross pay with multipliers', () => {
    const p = calculateShiftPay('2026-10-12T08:00:00Z', '2026-10-12T22:00:00Z', 0, 40, CA);
    expect(p.regularPay).toBe(320);
    expect(p.overtimePay).toBe(240);
    expect(p.doubletimePay).toBe(160);
    expect(p.grossPay).toBe(720);
  });

  it('projects shift cost across headcount', () => {
    expect(projectedShiftCost('2026-10-12T08:00:00Z', '2026-10-12T16:00:00Z', 35, 4, CA)).toBe(1120);
  });
});
