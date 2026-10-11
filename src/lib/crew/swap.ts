// ShiftSwap — hand a confirmed booking to a credentialed crewmate.
//
// Requester posts a swap (optional sweetener); cert-eligible workers claim;
// the requester accepts one claim and the DB runs the rest: an 'offered'
// assignment lands in the company's normal offer flow, the claimer accepts,
// the original booking withdraws, and any sweetener lands in the ledger.

import { supabase } from '@/lib/supabase';
import { SwapClaim, SwapRequest } from '@/lib/types';

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

export interface NewSwapRequest {
  assignmentId: string;
  shiftId: string;
  reason?: string;
  sweetenerCents?: number;
}

/** Post "can anyone take this call?" — assignment must be confirmed + yours. */
export async function postSwapRequest(input: NewSwapRequest): Promise<Result<SwapRequest | null>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('swap_requests')
      .insert({
        assignment_id: input.assignmentId,
        shift_id: input.shiftId,
        requester_worker_id: workerId,
        reason: input.reason ?? null,
        sweetener_cents: input.sweetenerCents ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as SwapRequest);
  } catch (e) {
    return fail(null, e);
  }
}

export async function cancelSwapRequest(requestId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase
      .from('swap_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

/** Put your hand up — the DB checks the cert gate and double-booking. */
export async function claimSwap(requestId: string, message?: string): Promise<Result<SwapClaim | null>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('swap_claims')
      .insert({ swap_request_id: requestId, claimer_worker_id: workerId, message: message ?? null })
      .select()
      .single();
    if (error) throw error;
    return ok(data as SwapClaim);
  } catch (e) {
    return fail(null, e);
  }
}

export async function withdrawClaim(claimId: string): Promise<Result<boolean>> {
  return setClaimStatus(claimId, 'withdrawn');
}

/** Requester accepts a claim — kicks off the offer-flow handoff. */
export async function acceptClaim(claimId: string): Promise<Result<boolean>> {
  return setClaimStatus(claimId, 'accepted');
}

export async function rejectClaim(claimId: string): Promise<Result<boolean>> {
  return setClaimStatus(claimId, 'rejected');
}

async function setClaimStatus(claimId: string, status: 'accepted' | 'rejected' | 'withdrawn'): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('swap_claims').update({ status }).eq('id', claimId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- queries --------------------------------------------------------------

const REQUEST_SELECT = '*, requester:profiles!swap_requests_requester_worker_id_fkey(id, full_name)';
const CLAIM_SELECT = '*, claimer:profiles!swap_claims_claimer_worker_id_fkey(id, full_name)';

/** Open swaps on a shift (RLS cert-gates visibility already) + claims. */
export async function listSwapBoard(shiftId: string): Promise<Result<{ requests: SwapRequest[]; claims: SwapClaim[] }>> {
  const empty = { requests: [] as SwapRequest[], claims: [] as SwapClaim[] };
  try {
    const { data: requests, error: rErr } = await supabase
      .from('swap_requests')
      .select(REQUEST_SELECT)
      .eq('shift_id', shiftId)
      .order('created_at', { ascending: false });
    if (rErr) throw rErr;
    const ids = (requests ?? []).map((r) => r.id);
    if (ids.length === 0) return ok(empty);
    const { data: claims, error: cErr } = await supabase
      .from('swap_claims')
      .select(CLAIM_SELECT)
      .in('swap_request_id', ids)
      .order('created_at');
    if (cErr) throw cErr;
    return ok({ requests: requests as SwapRequest[], claims: (claims ?? []) as SwapClaim[] });
  } catch (e) {
    return fail(empty, e);
  }
}

/** Company view: every swap across an event's shifts (RLS scopes to owns_shift). */
export async function listEventSwaps(eventId: string): Promise<Result<{ requests: SwapRequest[]; claims: SwapClaim[] }>> {
  const empty = { requests: [] as SwapRequest[], claims: [] as SwapClaim[] };
  try {
    const { data: shifts, error: sErr } = await supabase
      .from('shifts')
      .select('id')
      .eq('event_id', eventId);
    if (sErr) throw sErr;
    const shiftIds = (shifts ?? []).map((s) => s.id);
    if (shiftIds.length === 0) return ok(empty);
    const { data: requests, error: rErr } = await supabase
      .from('swap_requests')
      .select('*, requester:profiles!swap_requests_requester_worker_id_fkey(id, full_name), shift:shifts!swap_requests_shift_id_fkey(id, title, role_name)')
      .in('shift_id', shiftIds)
      .order('created_at', { ascending: false });
    if (rErr) throw rErr;
    const ids = (requests ?? []).map((r) => r.id);
    if (ids.length === 0) return ok(empty);
    const { data: claims, error: cErr } = await supabase
      .from('swap_claims')
      .select(CLAIM_SELECT)
      .in('swap_request_id', ids)
      .order('created_at');
    if (cErr) throw cErr;
    return ok({ requests: requests as SwapRequest[], claims: (claims ?? []) as SwapClaim[] });
  } catch (e) {
    return fail(empty, e);
  }
}

/** Company approves or rejects a swap (server enforces owns_shift). */
export async function companyDecideSwap(swapId: string, approve: boolean, reason?: string): Promise<Result<SwapRequest | null>> {
  try {
    const { data, error } = await supabase.rpc('company_decide_swap', {
      p_swap_id: swapId,
      p_approve: approve,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    return ok((data ?? null) as SwapRequest | null);
  } catch (e) {
    return fail(null, e);
  }
}

/** My open swap on a shift, if I posted one. */
export async function mySwapForShift(shiftId: string): Promise<Result<SwapRequest | null>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('swap_requests')
      .select(REQUEST_SELECT)
      .eq('shift_id', shiftId)
      .eq('requester_worker_id', workerId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return ok(data as SwapRequest | null);
  } catch (e) {
    return fail(null, e);
  }
}
