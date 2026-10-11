import { describe, expect, it } from 'vitest';
import { HELP_TEXT, IntentContext, routeIntent, summarize } from '../intents';

const ctx: IntentContext = {
  events: [
    { id: 'ev1', name: 'Aurora Arena Load-In' },
    { id: 'ev2', name: 'Harbor Festival' },
  ],
  shifts: [
    { id: 'sh1', title: 'Load-in', eventName: 'Aurora Arena Load-In' },
    { id: 'sh2', title: 'FOH Strike', eventName: 'Harbor Festival' },
  ],
};

describe('routeIntent', () => {
  it('routes unfilled-call questions with a default window', () => {
    const i = routeIntent('which calls are still unfilled?', ctx);
    expect(i).toEqual({ type: 'query', kind: 'unfilled_calls', args: { days_ahead: 7 }, label: 'Unfilled calls' });
  });

  it('parses day windows out of the question', () => {
    const i = routeIntent('any open calls in the next 3 days', ctx);
    expect(i.type).toBe('query');
    if (i.type === 'query') expect(i.args.days_ahead).toBe(3);
  });

  it('"this week" maps to a 7-day window', () => {
    const i = routeIntent('short staffed this week', ctx);
    if (i.type === 'query') expect(i.args.days_ahead).toBe(7);
  });

  it('routes timesheet approvals', () => {
    const i = routeIntent('timesheets waiting on me', ctx);
    expect(i.type).toBe('query');
    if (i.type === 'query') expect(i.kind).toBe('timesheets_pending');
  });

  it('routes cert expiry questions', () => {
    const i = routeIntent('which certifications expire in the next 60 days', ctx);
    if (i.type === 'query') {
      expect(i.kind).toBe('cert_expiring');
      expect(i.args.days).toBe(60);
    }
  });

  it('resolves an event name for budget questions', () => {
    const i = routeIntent('budget for Harbor Festival', ctx);
    expect(i).toEqual({
      type: 'query',
      kind: 'budget_status',
      args: { event_id: 'ev2' },
      label: 'Budget — Harbor Festival',
    });
  });

  it('falls back to upcoming events when a budget question names no event', () => {
    const i = routeIntent('how are budgets looking', ctx);
    if (i.type === 'query') expect(i.kind).toBe('upcoming_events');
  });

  it('resolves a shift name for crew questions', () => {
    const i = routeIntent('who is confirmed on the FOH Strike', ctx);
    expect(i).toEqual({
      type: 'query',
      kind: 'crew_for_shift',
      args: { shift_id: 'sh2' },
      label: 'Crew on a call',
    });
  });

  it('detects save-doc intents', () => {
    const i = routeIntent('remember that dock door 3 is broken', ctx);
    expect(i.type).toBe('action');
    if (i.type === 'action') expect(i.action).toBe('save_doc');
  });

  it('detects broadcast drafts and resolves the audience', () => {
    const i = routeIntent('text the FOH Strike crew that call time moved to 7am', ctx);
    expect(i.type).toBe('action');
    if (i.type === 'action') {
      expect(i.action).toBe('broadcast_draft');
      expect(i.payload.shift_id).toBe('sh2');
    }
  });

  it('broadcast to an unnamed audience targets everyone', () => {
    const i = routeIntent('broadcast that trucks can arrive an hour later', ctx);
    if (i.type === 'action') expect(i.payload.audience).toBe('all');
  });

  it('bails to help for unrelated text', () => {
    expect(routeIntent('what is the meaning of life', ctx).type).toBe('help');
    expect(routeIntent('', ctx).type).toBe('help');
  });
});

describe('summarize', () => {
  it('counts open seats across unfilled calls', () => {
    const s = summarize('unfilled_calls', [
      { shift_id: 'a', missing: 2 },
      { shift_id: 'b', missing: 3 },
    ]);
    expect(s).toContain('2 calls');
    expect(s).toContain('5 open seats');
  });

  it('says everything is staffed when there are no holes', () => {
    expect(summarize('unfilled_calls', [])).toContain('fully staffed');
  });

  it('summarizes pending timesheets with gross pay', () => {
    const s = summarize('timesheets_pending', [{ gross_pay: 1200 }, { gross_pay: 800 }]);
    expect(s).toContain('2 timesheets');
    expect(s).toContain('$2,000');
  });

  it('budget summary carries cap and projected labor', () => {
    const s = summarize('budget_status', [
      { name: 'Harbor Festival', budget_cap: 50000, projected_labor: 41000, booked_labor: 30000, approved_pay: 5000 },
    ]);
    expect(s).toContain('$50,000');
    expect(s).toContain('$41,000');
  });

  it('help text mentions the safe-read catalog', () => {
    expect(HELP_TEXT.toLowerCase()).toContain('unfilled');
  });
});
