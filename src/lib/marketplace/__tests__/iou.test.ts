import { describe, expect, it } from 'vitest';
import { iouCapacity, iouCapCents, selectSettleableIous } from '@/lib/crew/iouMath';

const iou = (id: string, amount_cents: number) => ({ id, amount_cents });

describe('iouCapCents', () => {
  it('caps deductions at 25% of gross', () => {
    expect(iouCapCents(10000)).toBe(2500);
    expect(iouCapCents(31840)).toBe(7960);
  });
});

describe('selectSettleableIous', () => {
  it('settles committed IOUs oldest-first within the cap', () => {
    const ious = [iou('a', 1000), iou('b', 1000), iou('c', 1000)];
    const r = selectSettleableIous(ious, 10000); // cap 2500
    expect(r.settledIds).toEqual(['a', 'b']);
    expect(r.skippedIds).toEqual(['c']);
    expect(r.totalCents).toBe(2000);
  });

  it('keeps rows whole — an IOU that overflows the cap stays committed', () => {
    const r = selectSettleableIous([iou('a', 2000), iou('b', 400)], 10000); // cap 2500
    expect(r.settledIds).toEqual(['a']);
    expect(r.skippedIds).toEqual(['b']);
    expect(r.totalCents).toBe(2000);
  });

  it('stops at the first IOU that overflows — older debt is never jumped', () => {
    const r = selectSettleableIous([iou('a', 2600), iou('b', 500)], 10000);
    expect(r.settledIds).toEqual([]);
    expect(r.skippedIds).toEqual(['a', 'b']);
    expect(r.totalCents).toBe(0);
  });

  it('settles nothing when there is no payout room', () => {
    const r = selectSettleableIous([iou('a', 100)], 0);
    expect(r.settledIds).toEqual([]);
    expect(r.totalCents).toBe(0);
  });
});

describe('iouCapacity', () => {
  it('reports committed vs. remaining room against expected gross', () => {
    const cap = iouCapacity([iou('a', 2000)], 10000);
    expect(cap).toEqual({ committedCents: 2000, capCents: 2500, remainingCents: 500 });
  });

  it('never reports negative remaining room', () => {
    const cap = iouCapacity([iou('a', 3000)], 10000);
    expect(cap.remainingCents).toBe(0);
  });
});
