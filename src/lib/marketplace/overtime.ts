import { OvertimeRule } from '@/lib/types';

export interface HoursBreakdown {
  workedHours: number;
  regularHours: number;
  overtimeHours: number;
  doubletimeHours: number;
  minimumCallApplied: boolean;
}

export interface PayBreakdown extends HoursBreakdown {
  regularPay: number;
  overtimePay: number;
  doubletimePay: number;
  grossPay: number;
}

export type OvertimePolicy = Pick<
  OvertimeRule,
  'daily_ot_after_hours' | 'daily_dt_after_hours' | 'ot_multiplier' | 'dt_multiplier' | 'minimum_call_hours'
> & { weekly_hours_before_shift?: number; weekly_ot_after_hours?: number | null };

export const FLSA_DEFAULT: OvertimePolicy = {
  daily_ot_after_hours: null,
  daily_dt_after_hours: null,
  weekly_ot_after_hours: 40,
  ot_multiplier: 1.5,
  dt_multiplier: 2,
  minimum_call_hours: 4,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Splits a single shift's worked time into regular / OT / DT hours.
 * Daily thresholds apply first; if the rule has a weekly threshold and the
 * worker's prior hours this week are supplied, the remainder over the weekly
 * cap is also promoted to OT.
 */
export function splitHours(
  clockIn: Date | string,
  clockOut: Date | string,
  breakMinutes: number,
  rule: OvertimePolicy,
): HoursBreakdown {
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    throw new Error('clockOut must be after clockIn');
  }

  const rawHours = (end - start) / 3_600_000 - Math.max(0, breakMinutes) / 60;
  const minimumCallApplied = rawHours < rule.minimum_call_hours;
  const worked = Math.max(rawHours, rule.minimum_call_hours);

  let doubletime = rule.daily_dt_after_hours != null ? Math.max(worked - rule.daily_dt_after_hours, 0) : 0;
  let overtime = rule.daily_ot_after_hours != null ? Math.max(worked - doubletime - rule.daily_ot_after_hours, 0) : 0;
  let regular = worked - overtime - doubletime;

  if (rule.weekly_ot_after_hours != null && rule.weekly_hours_before_shift != null) {
    const roomBeforeWeeklyCap = Math.max(rule.weekly_ot_after_hours - rule.weekly_hours_before_shift, 0);
    if (regular > roomBeforeWeeklyCap) {
      overtime += regular - roomBeforeWeeklyCap;
      regular = roomBeforeWeeklyCap;
    }
  }

  doubletime = round2(doubletime);
  overtime = round2(overtime);
  regular = round2(regular);

  return { workedHours: round2(worked), regularHours: regular, overtimeHours: overtime, doubletimeHours: doubletime, minimumCallApplied };
}

export function calculatePay(hours: HoursBreakdown, hourlyRate: number, rule: OvertimePolicy): PayBreakdown {
  const regularPay = round2(hours.regularHours * hourlyRate);
  const overtimePay = round2(hours.overtimeHours * hourlyRate * rule.ot_multiplier);
  const doubletimePay = round2(hours.doubletimeHours * hourlyRate * rule.dt_multiplier);
  return { ...hours, regularPay, overtimePay, doubletimePay, grossPay: round2(regularPay + overtimePay + doubletimePay) };
}

/** Convenience wrapper: clock times -> full pay breakdown. */
export function calculateShiftPay(
  clockIn: Date | string,
  clockOut: Date | string,
  breakMinutes: number,
  hourlyRate: number,
  rule: OvertimePolicy = FLSA_DEFAULT,
): PayBreakdown {
  return calculatePay(splitHours(clockIn, clockOut, breakMinutes, rule), hourlyRate, rule);
}

/** Projected cost of a shift as posted (scheduled window, no breaks) — used for budget forecasting. */
export function projectedShiftCost(startsAt: string, endsAt: string, hourlyRate: number, headcount: number, rule: OvertimePolicy = FLSA_DEFAULT): number {
  const perWorker = calculateShiftPay(startsAt, endsAt, 0, hourlyRate, rule).grossPay;
  return round2(perWorker * headcount);
}
