/**
 * Pay rules by state — the wage-and-hour basics a crew member actually
 * needs: how fast the check has to arrive, when overtime kicks in, and
 * what breaks are owed. Informational reference, not legal advice —
 * state labor departments own the definitive rules.
 */

export interface PayRule {
  state: string;
  code: string;
  /** How soon earned wages must be paid (regular payday law). */
  payday: string;
  /** Deadline for final pay after separation. */
  finalPay: string;
  /** Daily overtime triggers beyond the federal 40-hour week rule. */
  dailyOT: string;
  /** Meal/rest break entitlement. */
  breaks: string;
}

export const FEDERAL_BASELINE = {
  title: 'Federal baseline (FLSA)',
  payday: 'Federal law requires prompt payment but sets no single payday — state law controls.',
  overtime: 'Overtime at 1.5× your rate after 40 hours in a workweek.',
  minimum: 'Federal minimum wage: $7.25/hr (state minimums are usually higher).',
  record: 'Employers must keep accurate time and pay records — your own records are your backup.',
};

export const PAY_RULES: PayRule[] = [
  { state: 'California', code: 'CA', payday: 'At least twice a month on designated paydays.', finalPay: 'Immediately on termination; within 72 hours if you quit.', dailyOT: '1.5× over 8 hrs/day, 2× over 12 hrs/day; 7th straight workday gets OT from hour 1.', breaks: '30-min meal by hour 5; 10-min paid rest per 4 hrs — violations owe a penalty hour of pay.' },
  { state: 'Nevada', code: 'NV', payday: 'At least twice a month.', finalPay: 'Immediately on termination; next payday or 7 days if you quit.', dailyOT: '1.5× over 8 hrs/day when your rate is under 1.5× minimum wage.', breaks: '30-min meal within 8 hrs; 10-min rest per 4 hrs.' },
  { state: 'New York', code: 'NY', payday: 'Manual workers must be paid weekly.', finalPay: 'Next regular payday.', dailyOT: 'Over 40 hrs/week at 1.5×; spread-of-hours pay may apply to long split days.', breaks: 'Meal periods required by shift type; industry norms for crew are covered under spread-of-hours.' },
  { state: 'Texas', code: 'TX', payday: 'Non-exempt workers at least twice a month.', finalPay: 'Within 6 days of termination; next payday if you quit.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement; federal rules apply.' },
  { state: 'Florida', code: 'FL', payday: 'No state payday law — follow the posted schedule.', finalPay: 'Next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement; federal rules apply.' },
  { state: 'Georgia', code: 'GA', payday: 'At least twice a month on designated paydays.', finalPay: 'Next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement; federal rules apply.' },
  { state: 'Tennessee', code: 'TN', payday: 'At least once a month.', finalPay: 'Within 21 days or next regular payday, whichever is later.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: '30-min unpaid meal for 6+ hr shifts.' },
  { state: 'Illinois', code: 'IL', payday: 'At least twice a month; pay within 13 days of period end.', finalPay: 'By the next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: '20-min meal within first 5 hrs of a 7.5+ hr shift.' },
  { state: 'Colorado', code: 'CO', payday: 'At least once a month.', finalPay: 'Immediately on termination; next payday if you quit.', dailyOT: '1.5× over 12 hrs/day in addition to the 40-hr week rule.', breaks: '30-min meal within first 5 hrs; 10-min paid rest per 4 hrs.' },
  { state: 'Washington', code: 'WA', payday: 'At least once a month.', finalPay: 'End of the established pay period.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: '30-min meal between hours 2–5; 10-min paid rest per 4 hrs.' },
  { state: 'Pennsylvania', code: 'PA', payday: 'Regular paydays designated by the employer.', finalPay: 'Next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement; federal rules apply.' },
  { state: 'Louisiana', code: 'LA', payday: 'At least twice a month.', finalPay: 'Within 15 days of termination or next payday, whichever first.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement for adults; federal rules apply.' },
  { state: 'Arizona', code: 'AZ', payday: 'At least twice a month, within 16 days of each other.', finalPay: 'Within 7 days or next payday, whichever first.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement; federal rules apply.' },
  { state: 'Ohio', code: 'OH', payday: 'At least twice a month.', finalPay: 'Next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement; federal rules apply.' },
  { state: 'New Jersey', code: 'NJ', payday: 'At least twice a month.', finalPay: 'Next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement for adults; federal rules apply.' },
  { state: 'North Carolina', code: 'NC', payday: 'Regular paydays designated by the employer.', finalPay: 'Next regular payday.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: 'No state requirement for adults; federal rules apply.' },
  { state: 'Massachusetts', code: 'MA', payday: 'Weekly or biweekly.', finalPay: 'Same day on termination; next payday if you quit.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: '30-min meal for 6+ hr shifts.' },
  { state: 'Oregon', code: 'OR', payday: 'At least once every 35 days.', finalPay: 'End of first business day after termination; 5 days if you quit with notice.', dailyOT: 'Federal rule only — over 40 hrs/week.', breaks: '30-min meal; 10-min paid rest per 4 hrs.' },
];
