import { describe, expect, it } from 'vitest';
import { parseIcs, parseIcsDate } from './ics';

const NOW = new Date('2026-03-01T12:00:00Z');

const wrap = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`;

const vevent = (body: string) => `BEGIN:VEVENT\r\n${body}END:VEVENT\r\n`;

describe('parseIcsDate', () => {
  it('parses UTC, naive and all-day forms', () => {
    expect(parseIcsDate('20260310T170000Z')?.toISOString()).toBe('2026-03-10T17:00:00.000Z');
    expect(parseIcsDate('20260310T170000')?.toISOString()).toBe('2026-03-10T17:00:00.000Z');
    expect(parseIcsDate('20260310')?.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(parseIcsDate('garbage')).toBeNull();
  });
});

describe('parseIcs', () => {
  it('emits a single block for a plain event', () => {
    const blocks = parseIcs(wrap(vevent(
      'DTSTART:20260310T170000Z\r\nDTEND:20260310T210000Z\r\nSUMMARY:Dentist\r\n',
    )), NOW);
    expect(blocks).toEqual([{ start: '2026-03-10T17:00:00.000Z', end: '2026-03-10T21:00:00.000Z', summary: 'Dentist' }]);
  });

  it('drops past events and cancelled events', () => {
    const blocks = parseIcs(wrap(
      vevent('DTSTART:20260201T170000Z\r\nDTEND:20260201T180000Z\r\n') +
      vevent('DTSTART:20260310T170000Z\r\nDTEND:20260310T180000Z\r\nSTATUS:CANCELLED\r\n'),
    ), NOW);
    expect(blocks).toHaveLength(0);
  });

  it('honors DURATION when DTEND is absent', () => {
    const blocks = parseIcs(wrap(vevent('DTSTART:20260310T170000Z\r\nDURATION:PT2H\r\n')), NOW);
    expect(blocks[0].end).toBe('2026-03-10T19:00:00.000Z');
  });

  it('unfolds continuation lines before parsing', () => {
    const blocks = parseIcs(wrap(vevent(
      'DTSTART:20260310T170000Z\r\nDTEND:2026031\r\n 0T210000Z\r\n',
    )), NOW);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].end).toBe('2026-03-10T21:00:00.000Z');
  });

  it('expands weekly RRULE with COUNT', () => {
    const blocks = parseIcs(wrap(vevent(
      'DTSTART:20260303T140000Z\r\nDTEND:20260303T150000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\n',
    )), NOW);
    expect(blocks.map((b) => b.start)).toEqual([
      '2026-03-03T14:00:00.000Z',
      '2026-03-10T14:00:00.000Z',
      '2026-03-17T14:00:00.000Z',
    ]);
  });

  it('expands weekly BYDAY inside the start week', () => {
    const blocks = parseIcs(wrap(vevent(
      'DTSTART:20260303T140000Z\r\nDTEND:20260303T150000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4\r\n',
    )), NOW);
    // 2026-03-03 is a Tuesday: base + TH that week + TU+TH next week.
    expect(blocks.map((b) => b.start.slice(0, 10))).toEqual([
      '2026-03-03', '2026-03-05', '2026-03-10', '2026-03-12',
    ]);
  });

  it('expands monthly recurrence', () => {
    const blocks = parseIcs(wrap(vevent(
      'DTSTART:20260305T090000Z\r\nDTEND:20260305T100000Z\r\nRRULE:FREQ=MONTHLY;COUNT=2\r\n',
    )), NOW);
    expect(blocks.map((b) => b.start.slice(0, 10))).toEqual(['2026-03-05', '2026-04-05']);
  });

  it('stops expanding at UNTIL', () => {
    const blocks = parseIcs(wrap(vevent(
      'DTSTART:20260302T140000Z\r\nDTEND:20260302T150000Z\r\nRRULE:FREQ=DAILY;UNTIL=20260304T000000Z\r\n',
    )), NOW);
    expect(blocks.map((b) => b.start.slice(0, 10))).toEqual(['2026-03-02', '2026-03-03']);
  });
});
