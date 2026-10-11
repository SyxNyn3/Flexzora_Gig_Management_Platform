import { CrewIOU } from '@/lib/types';

/**
 * Pure Crew OS IOU math — no Supabase dependency so it can run in unit tests
 * and mirror exactly what approve_timesheet does in SQL.
 */

export const IOU_CAP_PCT = 25;

export interface BailPolicy {
  /** hours before shift start during which a voluntary bail keeps share */
  windowHours: number;
  /** percent of the IOU that stays committed on a late bail */
  keepPct: number;
}

export const DEFAULT_BAIL_POLICY: BailPolicy = { windowHours: 24, keepPct: 50 };

/**
 * Mirrors bail_kept_cents() in 20261114000000_bail_fairness.sql: a voluntary
 * bail inside the window keeps keepPct of the share; outside it voids fully.
 */
export function bailKeptCents(
  shiftStartsAt: string,
  amountCents: number,
  policy: BailPolicy = DEFAULT_BAIL_POLICY,
  now: Date = new Date(),
): number {
  const ms = new Date(shiftStartsAt).getTime() - now.getTime();
  if (ms > policy.windowHours * 3_600_000) return 0;
  return Math.round((amountCents * policy.keepPct) / 100);
}

export interface IouCapacity {
  committedCents: number;
  capCents: number;
  remainingCents: number;
}

/** 25% of gross, in cents — mirrors the cap inside approve_timesheet. */
export function iouCapCents(grossCents: number): number {
  return Math.round(grossCents * (IOU_CAP_PCT / 100));
}

export interface IouSettlement {
  id: string;
  /** cents collected from this IOU on this payout */
  takeCents: number;
  /** true when the IOU is fully paid off after this take */
  settled: boolean;
  /** cents still owed after this take */
  remainingCents: number;
}

type SettleableIou = Pick<CrewIOU, 'id' | 'amount_cents'> & { settled_cents?: number | null };

/**
 * How do committed IOUs (in created_at order) settle against a payout of
 * `grossCents`? Mirrors the PARTIAL settlement loop in approve_timesheet
 * (#28): each IOU gives up min(outstanding, remaining cap), oldest first,
 * until the cap is exhausted. An over-cap IOU shrinks instead of freezing the
 * queue; older debt is still never jumped by newer debt.
 */
export function selectSettleableIous(
  ious: SettleableIou[],
  grossCents: number,
): { settlements: IouSettlement[]; settledIds: string[]; partialIds: string[]; untouchedIds: string[]; totalCents: number } {
  const cap = iouCapCents(grossCents);
  let room = cap;
  const settlements: IouSettlement[] = [];
  const settledIds: string[] = [];
  const partialIds: string[] = [];
  const untouchedIds: string[] = [];
  for (const iou of ious) {
    const outstanding = iou.amount_cents - (iou.settled_cents ?? 0);
    if (outstanding <= 0) continue;
    if (room <= 0) {
      untouchedIds.push(iou.id);
      continue;
    }
    const take = Math.min(outstanding, room);
    room -= take;
    const remaining = outstanding - take;
    settlements.push({ id: iou.id, takeCents: take, settled: remaining === 0, remainingCents: remaining });
    (remaining === 0 ? settledIds : partialIds).push(iou.id);
  }
  return { settlements, settledIds, partialIds, untouchedIds, totalCents: cap - room };
}

/** Sum of a worker's outstanding committed IOUs for a shift vs. the 25% cap. */
export function iouCapacity(committedIous: SettleableIou[], expectedGrossCents: number): IouCapacity {
  const committedCents = committedIous.reduce((sum, i) => sum + Math.max(i.amount_cents - (i.settled_cents ?? 0), 0), 0);
  const capCents = iouCapCents(expectedGrossCents);
  return { committedCents, capCents, remainingCents: Math.max(capCents - committedCents, 0) };
}
