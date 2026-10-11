// Copilot intent routing — pure functions. Keywords in, typed intent out, so
// the router is unit-testable without Supabase or the LLM. The LLM (when
// available) only disambiguates what the heuristic misses; it never runs a
// query itself — copilot_query() is the only door to the data.

export type QueryKind =
  | 'unfilled_calls'
  | 'upcoming_events'
  | 'cert_expiring'
  | 'timesheets_pending'
  | 'budget_status'
  | 'crew_for_shift';

export type ActionKind = 'save_doc' | 'broadcast_draft';

export type CopilotIntent =
  | { type: 'query'; kind: QueryKind; args: Record<string, unknown>; label: string }
  | { type: 'action'; action: ActionKind; label: string; payload: Record<string, unknown> }
  | { type: 'help' };

export interface IntentContext {
  events: { id: string; name: string }[];
  shifts: { id: string; title: string; eventName: string }[];
}

export const QUERY_KINDS: { kind: QueryKind; label: string; hint: string }[] = [
  { kind: 'unfilled_calls', label: 'Unfilled calls', hint: 'shifts that still need crew' },
  { kind: 'upcoming_events', label: 'Upcoming events', hint: 'events and how staffed they are' },
  { kind: 'cert_expiring', label: 'Expiring certifications', hint: 'roster crew whose certs lapse soon' },
  { kind: 'timesheets_pending', label: 'Timesheets awaiting approval', hint: 'submitted sheets not yet decided' },
  { kind: 'budget_status', label: 'Event budget status', hint: 'cap vs projected and booked labor' },
  { kind: 'crew_for_shift', label: 'Crew on a call', hint: 'who is confirmed on a specific shift' },
];

const norm = (s: string) => s.toLowerCase().trim();

/** Pull a window like "next 3 days" / "this week" / "this month" out of text. */
function extractDays(text: string, fallback: number): number {
  const t = norm(text);
  const m = t.match(/(\d+)\s*(?:day|week|month)/);
  if (m) {
    const n = parseInt(m[1], 10);
    return t.includes('week') ? n * 7 : t.includes('month') ? n * 30 : n;
  }
  if (/\b(this|next)\s+week\b/.test(t)) return 7;
  if (/\b(this|next)\s+month\b/.test(t)) return 30;
  if (/\btoday\b/.test(t)) return 1;
  if (/\btomorrow\b/.test(t)) return 2;
  return fallback;
}

/** Longest context name that appears (as substring) inside the user text. */
function matchByName<T extends { id: string }>(text: string, items: (T & { name: string })[]): T | null {
  const t = norm(text);
  let best: T | null = null;
  let bestLen = 0;
  for (const item of items) {
    const name = norm(item.name);
    if (name.length >= 3 && t.includes(name) && name.length > bestLen) {
      best = item;
      bestLen = name.length;
    }
  }
  return best;
}

const ACTION_PATTERNS = {
  broadcast: /\b(broadcast|text|sms|notify|tell|remind|message|ping|reach out to)\b/,
  saveDoc: /\b(remember|note|save|write down|store|add (a |this )?(note|doc)|keep track)\b/,
};

export function routeIntent(text: string, ctx: IntentContext): CopilotIntent {
  const t = norm(text);
  if (!t) return { type: 'help' };

  // ---- Actions first (they're the most specific verbs) ----------------------
  if (ACTION_PATTERNS.saveDoc.test(t)) {
    return {
      type: 'action',
      action: 'save_doc',
      label: 'Save a company note',
      payload: { body: text },
    };
  }
  if (ACTION_PATTERNS.broadcast.test(t)) {
    const shift = matchByName(t, ctx.shifts.map((s) => ({ id: s.id, name: s.title })));
    const event = matchByName(t, ctx.events);
    return {
      type: 'action',
      action: 'broadcast_draft',
      label: 'Draft a broadcast',
      payload: {
        audience: shift ? 'shift' : event ? 'event' : 'all',
        shift_id: shift?.id ?? null,
        shift_title: shift ? ctx.shifts.find((s) => s.id === shift.id)?.title ?? null : null,
        event_id: event?.id ?? null,
        event_name: event?.name ?? null,
        draft: text.replace(ACTION_PATTERNS.broadcast, '').replace(/^\s*(a|the|to)\s+/i, '').trim(),
      },
    };
  }

  // ---- Queries --------------------------------------------------------------
  if (/\b(unfilled|open call|holes?|short[\s-]?staff|need(ing)? crew|still need|fill(ed|ing)?)\b/.test(t)) {
    return { type: 'query', kind: 'unfilled_calls', args: { days_ahead: extractDays(t, 7) }, label: 'Unfilled calls' };
  }
  if (/\b(timesheet|approve|approvals?|payroll|hours? (to )?approve|submitted)\b/.test(t)) {
    return { type: 'query', kind: 'timesheets_pending', args: {}, label: 'Timesheets awaiting approval' };
  }
  if (/\b(cert|certs|certification|credential|expir|osha|etcp|license)\b/.test(t)) {
    return { type: 'query', kind: 'cert_expiring', args: { days: extractDays(t, 30) }, label: 'Expiring certifications' };
  }
  if (/\b(budget|cost|spend|money|cap|over|financial)\b/.test(t)) {
    const event = matchByName(t, ctx.events);
    if (event) {
      return { type: 'query', kind: 'budget_status', args: { event_id: event.id }, label: `Budget — ${event.name}` };
    }
    // no event named → show upcoming events so the user can pick
    return { type: 'query', kind: 'upcoming_events', args: { days_ahead: 30 }, label: 'Upcoming events (pick one for budget)' };
  }
  if (/\b(who('s| is)?|crew|roster|booked|confirmed|working)\b/.test(t) && ctx.shifts.length) {
    const shift = matchByName(t, ctx.shifts.map((s) => ({ id: s.id, name: s.title })));
    if (shift) {
      return { type: 'query', kind: 'crew_for_shift', args: { shift_id: shift.id }, label: 'Crew on a call' };
    }
  }
  if (/\b(event|schedule|calendar|week|upcoming|next|gig|show)s?\b/.test(t)) {
    return { type: 'query', kind: 'upcoming_events', args: { days_ahead: extractDays(t, 14) }, label: 'Upcoming events' };
  }

  return { type: 'help' };
}

// ---------------------------------------------------------------------------
// Answer templates — one-line summaries rendered above the result table.
// ---------------------------------------------------------------------------
const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
};

export function summarize(kind: QueryKind, rows: Record<string, unknown>[]): string {
  switch (kind) {
    case 'unfilled_calls': {
      const missing = rows.reduce((a, r) => a + (Number(r.missing) || 0), 0);
      return rows.length
        ? `${rows.length} call${rows.length === 1 ? '' : 's'} still need${rows.length === 1 ? 's' : ''} crew — ${missing} open seat${missing === 1 ? '' : 's'} total.`
        : 'Every call in that window is fully staffed.';
    }
    case 'upcoming_events':
      return rows.length ? `${rows.length} event${rows.length === 1 ? '' : 's'} in that window.` : 'Nothing on the calendar in that window.';
    case 'cert_expiring': {
      const workers = new Set(rows.map((r) => r.worker_id));
      return rows.length
        ? `${rows.length} certification${rows.length === 1 ? '' : 's'} across ${workers.size} crew member${workers.size === 1 ? '' : 's'} lapse in that window.`
        : 'No roster certifications lapse in that window.';
    }
    case 'timesheets_pending': {
      const pay = rows.reduce((a, r) => a + (Number(r.gross_pay) || 0), 0);
      return rows.length
        ? `${rows.length} timesheet${rows.length === 1 ? '' : 's'} waiting on approval — ${money(pay)} gross.`
        : 'No submitted timesheets waiting.';
    }
    case 'budget_status': {
      const r = rows[0];
      if (!r) return 'No budget data for that event.';
      const cap = r.budget_cap != null ? money(r.budget_cap) : 'no cap set';
      return `${r.name}: cap ${cap} · projected labor ${money(r.projected_labor)} · booked ${money(r.booked_labor)} · approved ${money(r.approved_pay)}.`;
    }
    case 'crew_for_shift': {
      const r = rows[0];
      if (!r) return 'Nobody is booked on that call yet.';
      const confirmed = rows.filter((x) => x.status === 'confirmed' || x.status === 'completed').length;
      return `${r.shift_title} (${r.role_name}): ${confirmed} of ${r.headcount} confirmed.`;
    }
  }
}

export const HELP_TEXT =
  "I can answer questions about this company's operation — try " +
  '"what calls are still unfilled this week", "who\'s confirmed on the load-in", ' +
  '"which certs expire this month", "timesheets waiting on me", "budget for <event name>", ' +
  'or "what\'s coming up". I can also remember notes for the team ("remember that…") ' +
  'and draft a broadcast for review before anything goes out.';
