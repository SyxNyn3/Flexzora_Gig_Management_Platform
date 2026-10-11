// Minimal iCalendar (RFC 5545 subset) → busy-block parser for ical-sync.
// Zero dependencies so it's importable from both the Deno edge function and
// the vitest suite.
//
// Supported: unfolding, VEVENT DTSTART/DTEND (UTC + naive local-as-UTC +
// all-day DATE), DURATION (PnW PnD PTnHnMnS), STATUS:CANCELLED, RRULE
// FREQ=DAILY/WEEKLY/MONTHLY with INTERVAL/COUNT/UNTIL (+BYDAY on WEEKLY).
// TZID params are ignored — naive times are treated as UTC (documented
// caveat; exact-local-time recurrence needs a tz database).

const HORIZON_DAYS = 180;
const MAX_OCCURRENCES = 500;

export interface BusyBlock {
  start: string;
  end: string;
  summary?: string;
}

function unfold(ics: string): string[] {
  // A line starting with space/tab continues the previous line.
  const raw = ics.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const r of raw) {
    if ((r.startsWith(" ") || r.startsWith("\t")) && lines.length) lines[lines.length - 1] += r.slice(1);
    else lines.push(r);
  }
  return lines;
}

/** "20260310T170000Z" | "20260310T170000" | "20260310" → Date (naive treated as UTC). */
export function parseIcsDate(v: string): Date | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/** ISO-8601 subset: PnW, PnD, PTnHnMnS. */
function parseDuration(v: string): number {
  const m = v.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!m) return 0;
  const [, w = "0", d = "0", h = "0", mi = "0", s = "0"] = m;
  return ((+w * 7 + +d) * 24 * 60 + +h * 60 + +mi) * 60_000 + +s * 1000;
}

const DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function* occurrences(
  start: Date,
  durationMs: number,
  rrule: string | null,
  horizon: Date,
): Generator<{ start: Date; end: Date }> {
  yield { start, end: new Date(start.getTime() + durationMs) };
  if (!rrule) return;

  const kv = Object.fromEntries(
    rrule.split(";").map((p) => p.split("=") as [string, string]),
  );
  const freq = kv.FREQ;
  const interval = Math.max(1, parseInt(kv.INTERVAL ?? "1", 10) || 1);
  const count = Math.min(parseInt(kv.COUNT ?? "0", 10) || MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = kv.UNTIL ? parseIcsDate(kv.UNTIL) : null;
  const byDays = kv.BYDAY
    ? kv.BYDAY.split(",").map((d) => DAY[d.slice(-2)]).filter((d) => d != null)
    : null;

  if (freq === "WEEKLY" && byDays) {
    // Expand BYDAY within each interval-th week of the start's week.
    const dayStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const msSinceMidnight = start.getTime() - dayStart;
    const weekStart = dayStart - start.getUTCDay() * 86_400_000;
    let emitted = 1;
    let pastHorizon = false;
    for (let w = 0; w <= 400 && emitted < count && !pastHorizon; w++) {
      for (const dow of [...byDays].sort((a, b) => a - b)) {
        const occ = new Date(weekStart + (w * interval * 7 + dow) * 86_400_000 + msSinceMidnight);
        if (occ <= start) continue;
        if (occ > horizon || (until && occ > until)) { pastHorizon = true; break; }
        emitted++;
        yield { start: occ, end: new Date(occ.getTime() + durationMs) };
        if (emitted >= count) break;
      }
    }
    return;
  }

  const stepMs =
    freq === "DAILY" ? interval * 86_400_000 :
    freq === "WEEKLY" ? interval * 7 * 86_400_000 : null;

  let emitted = 1;
  if (stepMs != null) {
    const cursor = new Date(start);
    while (emitted < count) {
      const next = new Date(cursor.getTime() + stepMs * emitted);
      if (next > horizon || (until && next > until)) break;
      emitted++;
      yield { start: next, end: new Date(next.getTime() + durationMs) };
    }
    return;
  }

  if (freq === "MONTHLY") {
    let n = 1;
    while (emitted < count) {
      const next = new Date(Date.UTC(
        start.getUTCFullYear(), start.getUTCMonth() + interval * n, start.getUTCDate(),
        start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(),
      ));
      n++;
      if (next > horizon || (until && next > until)) break;
      emitted++;
      yield { start: next, end: new Date(next.getTime() + durationMs) };
    }
  }
}

/** Parse VEVENTs into horizon-clipped busy blocks (past events dropped). */
export function parseIcs(ics: string, now: Date = new Date()): BusyBlock[] {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const blocks: BusyBlock[] = [];
  let ev: Record<string, string> | null = null;

  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") { ev = {}; continue; }
    if (line === "END:VEVENT") {
      if (ev && ev.STATUS !== "CANCELLED") {
        const start = ev.DTSTART ? parseIcsDate(ev.DTSTART) : null;
        if (start) {
          const explicitEnd = ev.DTEND ? parseIcsDate(ev.DTEND) : null;
          const end = explicitEnd ?? (ev.DURATION ? new Date(start.getTime() + parseDuration(ev.DURATION)) : null);
          if (end && end > start) {
            const durationMs = end.getTime() - start.getTime();
            for (const occ of occurrences(start, durationMs, ev.RRULE ?? null, horizon)) {
              if (occ.end > now && occ.start < horizon) {
                blocks.push({ start: occ.start.toISOString(), end: occ.end.toISOString(), summary: ev.SUMMARY });
              }
            }
          }
        }
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const [prop, value] = [line.slice(0, sep), line.slice(sep + 1)];
    const name = prop.split(";")[0];
    if (["DTSTART", "DTEND", "DURATION", "RRULE", "SUMMARY", "STATUS"].includes(name)) {
      ev[name] = name === "SUMMARY" ? value.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ") : value;
    }
  }
  return blocks.slice(0, 5000);
}
