import { supabase } from '@/lib/supabase';
import { CrewIOU, CrewIOUKind, CrewIOUSettleVia } from '@/lib/types';

export { IOU_CAP_PCT, iouCapCents, selectSettleableIous, iouCapacity } from './iouMath';
export type { IouCapacity } from './iouMath';

/**
 * Crew OS IOU ledger.
 *
 * Workers commit to shared gig costs (rides, lodging, food, gear) before the
 * money exists. Committed payout-deduction IOUs settle automatically inside
 * approve_timesheet — capped at IOU_CAP_PCT of gross so nobody signs away the
 * check — and void if the shift is cancelled. Manual IOUs are marked settled
 * by the beneficiary (the driver/host/runner) once paid off-platform.
 */

export interface NewIOU {
  shiftId?: string;
  kind: CrewIOUKind;
  amountCents: number;
  beneficiaryWorkerId?: string;
  beneficiary?: string;
  settleVia?: CrewIOUSettleVia;
  iouGroupId?: string;
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

export async function commitIou(input: NewIOU): Promise<Result<CrewIOU | null>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('crew_iou')
      .insert({
        worker_id: workerId,
        shift_id: input.shiftId ?? null,
        kind: input.kind,
        amount_cents: input.amountCents,
        beneficiary_worker_id: input.beneficiaryWorkerId ?? null,
        beneficiary: input.beneficiary ?? null,
        settle_via: input.settleVia ?? 'payout_deduction',
        iou_group_id: input.iouGroupId ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as CrewIOU);
  } catch (e) {
    return fail(null, e);
  }
}

export async function listIousForShift(shiftId: string): Promise<Result<CrewIOU[]>> {
  try {
    const { data, error } = await supabase
      .from('crew_iou')
      .select('*, beneficiary_profile:profiles!crew_iou_beneficiary_worker_id_fkey(id, full_name)')
      .eq('shift_id', shiftId)
      .order('created_at');
    if (error) throw error;
    return ok((data ?? []) as CrewIOU[]);
  } catch (e) {
    return fail([], e);
  }
}

export async function listMyIous(): Promise<Result<CrewIOU[]>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail([], new Error('Not signed in'));
    const { data, error } = await supabase
      .from('crew_iou')
      .select('*, beneficiary_profile:profiles!crew_iou_beneficiary_worker_id_fkey(id, full_name)')
      .or(`worker_id.eq.${workerId},beneficiary_worker_id.eq.${workerId}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok((data ?? []) as CrewIOU[]);
  } catch (e) {
    return fail([], e);
  }
}

export async function voidIou(iouId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('crew_iou').update({ status: 'void' }).eq('id', iouId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

/** Beneficiary confirms a manual IOU was paid off-platform. */
export async function confirmManualSettlement(iouId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase
      .from('crew_iou')
      .update({ status: 'settled', settled_at: new Date().toISOString() })
      .eq('id', iouId)
      .eq('settle_via', 'manual');
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}
