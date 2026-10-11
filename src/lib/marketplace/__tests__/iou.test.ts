import { describe, expect, it } from 'vitest';
import { bailKeptCents, iouCapacity, iouCapCents, selectSettleableIous } from '@/lib/crew/iouMath';

const iou = (id: string, amount_cents: number, settled_cents = 0) => ({ id, amount_cents, settled_cents });

describe('iouCapCents', () => {
  it('caps deductions at 25% of gross', () => {
    expect(iouCapCents(10000)).toBe(2500);
    expect(iouCapCents(31840)).toBe(7960);
  });
});

describe('selectSettleableIous (partial settlement, #28)', () => {
  it('settles committed IOUs oldest-first within the cap', () => {
    const ious = [iou('a', 1000), iou('b', 1000), iou('c', 1000)];
    const r = selectSettleableIous(ious, 10000); // cap 2500
    expect(r.settledIds).toEqual(['a', 'b']);
    expect(r.partialIds).toEqual(['c']);
    expect(r.settlements[2]).toEqual({ id: 'c', takeCents: 500, settled: false, remainingCents: 500 });
    expect(r.totalCents).toBe(2500);
  });

  it('an IOU larger than the whole cap settles PARTIALLY instead of freezing the queue', () => {
    const r = selectSettleableIous([iou('big', 2600), iou('b', 500)], 10000); // cap 2500
    expect(r.partialIds).toEqual(['big']);
    expect(r.settlements[0]).toEqual({ id: 'big', takeCents: 2500, settled: false, remainingCents: 100 });
    expect(r.totalCents).toBe(2500);
  });

  it('older debt is never jumped: the next IOU only gets what the older one left', () => {
    const r = selectSettleableIous([iou('a', 2000), iou('b', 1000)], 10000); // cap 2500
    expect(r.settledIds).toEqual(['a']);
    expect(r.partialIds).toEqual(['b']);
    expect(r.settlements[1].takeCents).toBe(500);
    expect(r.totalCents).toBe(2500);
  });

  it('the remainder of a partially settled IOU survives to the next payout', () => {
    const first = selectSettleableIous([iou('big', 2600)], 10000); // takes 2500, 100 left
    const carried = iou('big', 2600, 2600 - first.settlements[0].remainingCents);
    const second = selectSettleableIous([carried, iou('next', 400)], 10000);
    expect(second.settlements[0]).toEqual({ id: 'big', takeCents: 100, settled: true, remainingCents: 0 });
    expect(second.settledIds).toEqual(['big', 'next']);
    expect(second.totalCents).toBe(500);
  });

  it('IOUs behind an exhausted cap are left untouched (not partially settled)', () => {
    const r = selectSettleableIous([iou('a', 2500), iou('b', 300)], 10000);
    expect(r.settledIds).toEqual(['a']);
    expect(r.untouchedIds).toEqual(['b']);
  });

  it('settles every IOU when the total fits inside the cap', () => {
    const r = selectSettleableIous([iou('a', 2000), iou('b', 400)], 10000); // 2400 <= 2500
    expect(r.settledIds).toEqual(['a', 'b']);
    expect(r.partialIds).toEqual([]);
    expect(r.totalCents).toBe(2400);
  });

  it('settles nothing when there is no payout room', () => {
    const r = selectSettleableIous([iou('a', 100)], 0);
    expect(r.settlements).toEqual([]);
    expect(r.untouchedIds).toEqual(['a']);
    expect(r.totalCents).toBe(0);
  });

  it('skips IOUs that are already fully collected', () => {
    const r = selectSettleableIous([iou('done', 500, 500), iou('b', 300)], 10000);
    expect(r.settlements.map((s) => s.id)).toEqual(['b']);
  });
});

describe('iouCapacity', () => {
  it('reports outstanding vs. remaining room against expected gross', () => {
    const cap = iouCapacity([iou('a', 2000)], 10000);
    expect(cap).toEqual({ committedCents: 2000, capCents: 2500, remainingCents: 500 });
  });

  it('counts only the uncollected part of partially settled IOUs', () => {
    const cap = iouCapacity([iou('a', 2000, 1500)], 10000);
    expect(cap.committedCents).toBe(500);
  });

  it('never reports negative remaining room', () => {
    const cap = iouCapacity([iou('a', 3000)], 10000);
    expect(cap.remainingCents).toBe(0);
  });
});

describe('bailKeptCents (late-bail fairness)', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const inWindow = '2026-10-11T08:00:00Z'; // 20h out — inside the default 24h window
  const outWindow = '2026-10-12T13:00:00Z'; // 49h out — outside

  it('keeps keepPct of the share inside the window', () => {
    expect(bailKeptCents(inWindow, 2000, { windowHours: 24, keepPct: 50 }, now)).toBe(1000);
  });

  it('voids fully outside the window', () => {
    expect(bailKeptCents(outWindow, 2000, { windowHours: 24, keepPct: 50 }, now)).toBe(0);
  });

  it('counts a shift already started as inside the window', () => {
    expect(bailKeptCents('2026-10-10T08:00:00Z', 2000, { windowHours: 24, keepPct: 50 }, now)).toBe(1000);
  });

  it('respects a tuned policy row', () => {
    expect(bailKeptCents(inWindow, 2000, { windowHours: 12, keepPct: 75 }, now)).toBe(0);
    expect(bailKeptCents('2026-10-10T20:00:00Z', 2000, { windowHours: 12, keepPct: 75 }, now)).toBe(1500);
  });
});
