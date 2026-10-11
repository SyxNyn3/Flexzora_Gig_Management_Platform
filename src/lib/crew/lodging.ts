import { supabase } from '@/lib/supabase';
import { LodgingPool, LodgingPoolKind, PoolMember } from '@/lib/types';

/**
 * BunkUp lodging pools — shared hotel/Airbnb/camp spots for a shift.
 *
 * A crew member hosts a pool with a per-spot share; joining takes spots and
 * the DB trigger mints the lodging-share crew_iou (beneficiary=host) so the
 * cost settles out of the member's approved payout. Leaving frees the spots
 * and voids the IOU. Pool or shift cancel voids everything committed.
 */

export interface NewLodgingPool {
  shiftId: string;
  kind: LodgingPoolKind;
  name: string;
  addressArea?: string;
  checkInAt?: string;
  checkOutAt?: string;
  spots: number;
  totalCostCents?: number;
  shareCents?: number;
  notes?: string;
}

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

async function myProfileId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).single();
  return data?.id ?? null;
}

export function spotsFree(pool: Pick<LodgingPool, 'spots' | 'spots_taken'>): number {
  return pool.spots - pool.spots_taken;
}

/** Even split preview — what a spot would cost if the total divided evenly. */
export function evenShareCents(pool: Pick<LodgingPool, 'total_cost_cents' | 'spots'>): number | null {
  if (!pool.total_cost_cents) return null;
  return Math.ceil(pool.total_cost_cents / pool.spots);
}

// --- pools ----------------------------------------------------------------

export async function postLodgingPool(input: NewLodgingPool): Promise<Result<LodgingPool | null>> {
  try {
    const hostId = await myProfileId();
    if (!hostId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('lodging_pools')
      .insert({
        shift_id: input.shiftId,
        host_worker_id: hostId,
        kind: input.kind,
        name: input.name,
        address_area: input.addressArea ?? null,
        check_in_at: input.checkInAt ?? null,
        check_out_at: input.checkOutAt ?? null,
        spots: input.spots,
        total_cost_cents: input.totalCostCents ?? null,
        share_cents: input.shareCents ?? 0,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as LodgingPool);
  } catch (e) {
    return fail(null, e);
  }
}

export async function cancelLodgingPool(poolId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('lodging_pools').update({ status: 'cancelled' }).eq('id', poolId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- membership -----------------------------------------------------------

/** Join a pool — takes spots and mints the lodging-share IOU in the DB. */
export async function joinPool(poolId: string, spotsNeeded = 1, notes?: string): Promise<Result<PoolMember | null>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('pool_members')
      .insert({ pool_id: poolId, worker_id: workerId, spots_needed: spotsNeeded, notes: notes ?? null })
      .select()
      .single();
    if (error) throw error;
    return ok(data as PoolMember);
  } catch (e) {
    return fail(null, e);
  }
}

/** Leave a pool — frees the spots and voids the share IOU. */
export async function leavePool(memberId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('pool_members').update({ status: 'left' }).eq('id', memberId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

/** Host or company removes a member. */
export async function removePoolMember(memberId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('pool_members').update({ status: 'removed' }).eq('id', memberId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- queries --------------------------------------------------------------

export async function listLodgingBoard(shiftId: string): Promise<Result<{ pools: LodgingPool[]; members: PoolMember[] }>> {
  const empty = { pools: [] as LodgingPool[], members: [] as PoolMember[] };
  try {
    const { data: pools, error: poolsError } = await supabase
      .from('lodging_pools')
      .select('*, host:profiles!lodging_pools_host_worker_id_fkey(id, full_name)')
      .eq('shift_id', shiftId)
      .order('created_at');
    if (poolsError) throw poolsError;
    const poolIds = (pools ?? []).map((p) => p.id);
    if (poolIds.length === 0) return ok(empty);
    const { data: members, error: membersError } = await supabase
      .from('pool_members')
      .select('*, worker:profiles!pool_members_worker_id_fkey(id, full_name)')
      .in('pool_id', poolIds)
      .order('created_at');
    if (membersError) throw membersError;
    return ok({ pools: pools as LodgingPool[], members: (members ?? []) as PoolMember[] });
  } catch (e) {
    return fail(empty, e);
  }
}
