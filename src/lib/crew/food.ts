import { supabase } from '@/lib/supabase';
import { FoodRun, FoodRunOrder } from '@/lib/types';

/**
 * GrubRun — pooled food orders with a cutoff.
 *
 * A runner posts a run (restaurant + order cutoff); workers place orders
 * before the cutoff; the runner confirms each with the actual price — that's
 * when the food crew_iou mints (beneficiary=runner). Cancelling a confirmed
 * order voids it; cancelling the run voids them all.
 */

export interface NewFoodRun {
  shiftId: string;
  restaurant: string;
  menuLink?: string;
  orderCutoffAt: string;
  deliveryArea?: string;
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

/** Can a worker still place/edit an order? Runner edits are server-exempt. */
export function isAcceptingOrders(run: Pick<FoodRun, 'status' | 'order_cutoff_at'>, now = new Date()): boolean {
  return run.status === 'open' && new Date(run.order_cutoff_at) > now;
}

// --- runs -----------------------------------------------------------------

export async function postFoodRun(input: NewFoodRun): Promise<Result<FoodRun | null>> {
  try {
    const runnerId = await myProfileId();
    if (!runnerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('food_runs')
      .insert({
        shift_id: input.shiftId,
        runner_worker_id: runnerId,
        restaurant: input.restaurant,
        menu_link: input.menuLink ?? null,
        order_cutoff_at: input.orderCutoffAt,
        delivery_area: input.deliveryArea ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as FoodRun);
  } catch (e) {
    return fail(null, e);
  }
}

export async function updateFoodRunStatus(runId: string, status: 'ordered' | 'delivered' | 'cancelled'): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('food_runs').update({ status }).eq('id', runId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- orders ---------------------------------------------------------------

export async function placeOrder(runId: string, item: string, notes?: string): Promise<Result<FoodRunOrder | null>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('food_run_orders')
      .insert({ run_id: runId, worker_id: workerId, item, notes: notes ?? null })
      .select()
      .single();
    if (error) throw error;
    return ok(data as FoodRunOrder);
  } catch (e) {
    return fail(null, e);
  }
}

export async function cancelOrder(orderId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('food_run_orders').update({ status: 'cancelled' }).eq('id', orderId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

/** Runner confirms an order with the actual price — mints the food IOU. */
export async function confirmOrder(orderId: string, priceCents: number): Promise<Result<boolean>> {
  try {
    const { error } = await supabase
      .from('food_run_orders')
      .update({ status: 'confirmed', price_cents: priceCents })
      .eq('id', orderId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- queries --------------------------------------------------------------

export async function listFoodBoard(shiftId: string): Promise<Result<{ runs: FoodRun[]; orders: FoodRunOrder[] }>> {
  const empty = { runs: [] as FoodRun[], orders: [] as FoodRunOrder[] };
  try {
    const { data: runs, error: runsError } = await supabase
      .from('food_runs')
      .select('*, runner:profiles!food_runs_runner_worker_id_fkey(id, full_name)')
      .eq('shift_id', shiftId)
      .order('order_cutoff_at');
    if (runsError) throw runsError;
    const runIds = (runs ?? []).map((r) => r.id);
    if (runIds.length === 0) return ok(empty);
    const { data: orders, error: ordersError } = await supabase
      .from('food_run_orders')
      .select('*, worker:profiles!food_run_orders_worker_id_fkey(id, full_name)')
      .in('run_id', runIds)
      .order('created_at');
    if (ordersError) throw ordersError;
    return ok({ runs: runs as FoodRun[], orders: (orders ?? []) as FoodRunOrder[] });
  } catch (e) {
    return fail(empty, e);
  }
}
