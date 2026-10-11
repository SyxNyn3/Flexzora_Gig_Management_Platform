// LLM-assisted intent routing. The model only picks a whitelisted catalog kind
// and resolves event/shift names to ids from context we hand it — every reply
// is sanitized server-side-of-the-client before a query ever runs.
import { extractJson, omniChat } from '../llm';
import { CopilotIntent, IntentContext, QUERY_KINDS, QueryKind } from './intents';

const VALID_KINDS = new Set(QUERY_KINDS.map((q) => q.kind));

export async function llmRouteIntent(text: string, ctx: IntentContext): Promise<CopilotIntent | null> {
  const catalog = QUERY_KINDS.map((q) => `${q.kind}: ${q.hint}`).join('\n');
  const eventList = ctx.events.map((e) => `${e.id} = ${e.name}`).join('\n') || '(none)';
  const shiftList = ctx.shifts.map((s) => `${s.id} = ${s.title} (${s.eventName})`).join('\n') || '(none)';

  const content = await omniChat([
    {
      role: 'system',
      content:
        'You route questions from an event-production company to a fixed read-only query catalog. ' +
        'Reply with ONLY JSON: {"kind": one of the catalog kinds or "help", "days_ahead": number?, ' +
        '"days": number?, "event_id": uuid?, "shift_id": uuid?}. ' +
        'budget_status requires event_id; crew_for_shift requires shift_id; use "help" if nothing fits. ' +
        'Never invent ids — only use the ones listed.',
    },
    {
      role: 'user',
      content: `Catalog:\n${catalog}\n\nEvents:\n${eventList}\n\nShifts:\n${shiftList}\n\nQuestion: ${text}`,
    },
  ], 6000);
  if (!content) return null;
  const parsed = extractJson(content);
  if (!parsed || typeof parsed.kind !== 'string') return null;

  const kind = parsed.kind;
  const num = (k: string, d: number) => {
    const v = parsed[k];
    return typeof v === 'number' && v > 0 ? Math.round(v) : d;
  };
  const eventIds = new Set(ctx.events.map((e) => e.id));
  const shiftIds = new Set(ctx.shifts.map((s) => s.id));

  if (!VALID_KINDS.has(kind as QueryKind)) return null;

  switch (kind) {
    case 'unfilled_calls':
      return { type: 'query', kind, args: { days_ahead: num('days_ahead', 7) }, label: 'Unfilled calls' };
    case 'upcoming_events':
      return { type: 'query', kind, args: { days_ahead: num('days_ahead', 14) }, label: 'Upcoming events' };
    case 'cert_expiring':
      return { type: 'query', kind, args: { days: num('days', 30) }, label: 'Expiring certifications' };
    case 'timesheets_pending':
      return { type: 'query', kind, args: {}, label: 'Timesheets awaiting approval' };
    case 'budget_status': {
      const id = typeof parsed.event_id === 'string' && eventIds.has(parsed.event_id) ? parsed.event_id : null;
      if (!id) return null;
      return { type: 'query', kind, args: { event_id: id }, label: `Budget — ${ctx.events.find((e) => e.id === id)?.name}` };
    }
    case 'crew_for_shift': {
      const id = typeof parsed.shift_id === 'string' && shiftIds.has(parsed.shift_id) ? parsed.shift_id : null;
      if (!id) return null;
      return { type: 'query', kind, args: { shift_id: id }, label: 'Crew on a call' };
    }
    default:
      return { type: 'help' };
  }
}
