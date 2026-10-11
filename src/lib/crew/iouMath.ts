import { CrewIOU } from '@/lib/types';

/**
 * Pure Crew OS IOU math — no Supabase dependency so it can run in unit tests
 * and mirror exactly what approve_timesheet does in SQL.
 */

export const IOU_CAP_PCT = 25;

export interface IouCapacity {
  committedCents: number;
  capCents: number;
  remainingCents: number;
}

/** 25% of gross, in cents — mirrors the cap inside approve_timesheet. */
export function iouCapCents(grossCents: number): number {
  return Math.round(grossCents * (IOU_CAP_PCT / 100));
}

/**
 * Which committed IOUs (in created_at order) will settle against a payout of
 * `grossCents`? Mirrors the greedy whole-row selection in approve_timesheet:
 * settle oldest first, stop at the first row that doesn't fit — an older IOU
 * is never jumped by a newer one, it just rides the next payout.
 */
export function selectSettleableIous(
  ious: Pick<CrewIOU, 'id' | 'amount_cents'>[],
  grossCents: number,
): { settledIds: string[]; totalCents: number; skippedIds: string[] } {
  let room = iouCapCents(grossCents);
  const settledIds: string[] = [];
  const skippedIds: string[] = [];
  for (const iou of ious) {
    if (iou.amount_cents > room) {
      skippedIds.push(...ious.slice(ious.indexOf(iou)).map((i) => i.id));
      break;
    }
    room -= iou.amount_cents;
    settledIds.push(iou.id);
  }
  return { settledIds, totalCents: iouCapCents(grossCents) - room, skippedIds };
}

/** Sum of a worker's committed IOUs for a shift vs. the 25% cap. */
export function iouCapacity(committedIous: Pick<CrewIOU, 'amount_cents'>[], expectedGrossCents: number): IouCapacity {
  const committedCents = committedIous.reduce((sum, i) => sum + i.amount_cents, 0);
  const capCents = iouCapCents(expectedGrossCents);
  return { committedCents, capCents, remainingCents: Math.max(capCents - committedCents, 0) };
}
