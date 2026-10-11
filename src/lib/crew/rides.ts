import { supabase } from '@/lib/supabase';
import { RideOffer, RideRequest } from '@/lib/types';

/**
 * CrewPool rides — carpools to a shift.
 *
 * Drivers post an offer (seats + optional per-seat gas share); riders either
 * post an open request or join an offer directly. The database triggers do
 * the seat accounting and mint the gas-share crew_iou on match, so these
 * helpers are thin writes — the ledger is the source of truth.
 */

export interface NewRideOffer {
  shiftId: string;
  seats: number;
  departureArea?: string;
  departureAt?: string;
  gasShareCents?: number;
  notes?: string;
}

export interface NewRideRequest {
  shiftId: string;
  seatsNeeded?: number;
  pickupArea?: string;
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

/** Seats still free on an offer. */
export function seatsFree(offer: Pick<RideOffer, 'seats' | 'seats_taken'>): number {
  return offer.seats - offer.seats_taken;
}

/** Rider's projected gas share in cents if they join this offer. */
export function projectedGasShareCents(offer: Pick<RideOffer, 'gas_share_cents'>, seatsNeeded = 1): number {
  return offer.gas_share_cents * seatsNeeded;
}

// --- offers ---------------------------------------------------------------

export async function postRideOffer(input: NewRideOffer): Promise<Result<RideOffer | null>> {
  try {
    const driverId = await myProfileId();
    if (!driverId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('ride_offers')
      .insert({
        shift_id: input.shiftId,
        driver_worker_id: driverId,
        seats: input.seats,
        departure_area: input.departureArea ?? null,
        departure_at: input.departureAt ?? null,
        gas_share_cents: input.gasShareCents ?? 0,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as RideOffer);
  } catch (e) {
    return fail(null, e);
  }
}

export async function cancelRideOffer(offerId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('ride_offers').update({ status: 'cancelled' }).eq('id', offerId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- requests -------------------------------------------------------------

/** Post an open "need a ride" request. */
export async function requestRide(input: NewRideRequest): Promise<Result<RideRequest | null>> {
  try {
    const riderId = await myProfileId();
    if (!riderId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('ride_requests')
      .insert({
        shift_id: input.shiftId,
        rider_worker_id: riderId,
        seats_needed: input.seatsNeeded ?? 1,
        pickup_area: input.pickupArea ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as RideRequest);
  } catch (e) {
    return fail(null, e);
  }
}

/** Join an offer — creates a matched request; the DB takes the seat + IOU. */
export async function joinRide(offerId: string, input: NewRideRequest): Promise<Result<RideRequest | null>> {
  try {
    const riderId = await myProfileId();
    if (!riderId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('ride_requests')
      .insert({
        shift_id: input.shiftId,
        rider_worker_id: riderId,
        seats_needed: input.seatsNeeded ?? 1,
        pickup_area: input.pickupArea ?? null,
        notes: input.notes ?? null,
        status: 'matched',
        offer_id: offerId,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as RideRequest);
  } catch (e) {
    return fail(null, e);
  }
}

/** Rider bails — frees the seat and voids the gas-share IOU. */
export async function withdrawRideRequest(requestId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('ride_requests').update({ status: 'withdrawn' }).eq('id', requestId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

// --- queries --------------------------------------------------------------

export async function listRideBoard(shiftId: string): Promise<Result<{ offers: RideOffer[]; requests: RideRequest[] }>> {
  const empty = { offers: [] as RideOffer[], requests: [] as RideRequest[] };
  try {
    const [offers, requests] = await Promise.all([
      supabase
        .from('ride_offers')
        .select('*, driver:profiles!ride_offers_driver_worker_id_fkey(id, full_name)')
        .eq('shift_id', shiftId)
        .order('created_at'),
      supabase
        .from('ride_requests')
        .select('*, rider:profiles!ride_requests_rider_worker_id_fkey(id, full_name)')
        .eq('shift_id', shiftId)
        .order('created_at'),
    ]);
    if (offers.error) throw offers.error;
    if (requests.error) throw requests.error;
    return ok({ offers: (offers.data ?? []) as RideOffer[], requests: (requests.data ?? []) as RideRequest[] });
  } catch (e) {
    return fail(empty, e);
  }
}

/** Toggle the need-ride / can-drive flags on the caller's own assignment. */
export async function setRideFlags(assignmentId: string, flags: { needs_ride?: boolean; can_drive?: boolean }): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('shift_assignments').update(flags).eq('id', assignmentId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}
