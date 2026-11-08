import { supabase } from '@/lib/supabase';

// Day-level availability (worker_availability_days). Separate from the
// time-window `availability` table: windows say "8a–6p Tuesday", days say
// "I'm out Dec 24–Jan 2". The year calendar writes here.

export type AvailabilityDayStatus = 'available' | 'unavailable' | 'tentative';

export interface AvailabilityDay {
  id: string;
  worker_id: string;
  day: string; // YYYY-MM-DD
  status: AvailabilityDayStatus;
  note: string | null;
}

const TABLE = 'worker_availability_days';

// Fetch every marked day for a worker inside [from, to] (inclusive, YYYY-MM-DD).
export async function fetchAvailabilityDays(
  workerId: string,
  from: string,
  to: string,
): Promise<Map<string, AvailabilityDay>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, worker_id, day, status, note')
    .eq('worker_id', workerId)
    .gte('day', from)
    .lte('day', to);
  if (error) throw error;
  const map = new Map<string, AvailabilityDay>();
  for (const row of (data ?? []) as AvailabilityDay[]) {
    map.set(row.day, row);
  }
  return map;
}

// Upsert one day. ON CONFLICT (worker_id, day) lets a worker flip a status
// without delete+insert; RLS still scopes to their own rows.
export async function setAvailabilityDay(
  workerId: string,
  day: string,
  status: AvailabilityDayStatus,
  note?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { worker_id: workerId, day, status, note: note ?? null },
      { onConflict: 'worker_id,day' },
    );
  if (error) throw error;
}

export async function clearAvailabilityDay(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// US federal holidays — the "auto-mark my days off" preset.
// Computed client-side (no API, no dependency): fixed-date holidays plus the
// nth-weekday rules for MLK, Presidents, Memorial, Labor, Columbus, and
// Thanksgiving. Observed-day shifting (Sat→Fri, Sun→Mon) is included because
// that's the day most people actually take off.
// ---------------------------------------------------------------------------

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  // weekday: 0=Sun..6=Sat. Returns the date of the nth such weekday.
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function observed(d: Date): Date {
  // Federal holiday observance: Saturday -> preceding Friday, Sunday ->
  // following Monday. The observed date is the day workers actually mark off.
  if (d.getDay() === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  if (d.getDay() === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function usFederalHolidays(year: number): { day: string; name: string }[] {
  const fixed: [number, number, string][] = [
    [0, 1, "New Year's Day"],
    [6, 19, 'Juneteenth'],
    [6, 4, 'Independence Day'],
    [10, 11, 'Veterans Day'],
    [11, 25, 'Christmas Day'],
  ];
  const out: { day: string; name: string }[] = [];
  for (const [m, dom, name] of fixed) {
    out.push({ day: ymd(observed(new Date(year, m, dom))), name });
  }
  out.push({ day: ymd(observed(nthWeekdayOfMonth(year, 0, 1, 3))), name: 'Martin Luther King Jr. Day' });
  out.push({ day: ymd(observed(nthWeekdayOfMonth(year, 1, 1, 3))), name: "Presidents' Day" });
  out.push({ day: ymd(observed(lastWeekdayOfMonth(year, 4, 1))), name: 'Memorial Day' });
  out.push({ day: ymd(observed(nthWeekdayOfMonth(year, 8, 1, 1))), name: 'Labor Day' });
  out.push({ day: ymd(observed(nthWeekdayOfMonth(year, 9, 1, 2))), name: 'Columbus Day' });
  out.push({ day: ymd(observed(nthWeekdayOfMonth(year, 10, 4, 4))), name: 'Thanksgiving' });
  return out;
}
