// Stripe Connect — worker payout onboarding + company payout release.
// All three calls degrade gracefully: when the platform hasn't configured
// STRIPE_SECRET_KEY the functions answer {available:false} and the UI hides.

import { supabase } from '@/lib/supabase';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export interface ConnectStatus {
  available: boolean;
  connected?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
}

/** Start (or resume) Stripe Express onboarding — returns the hosted link. */
export async function onboardToConnect(): Promise<Result<{ url: string | null; available: boolean }>> {
  try {
    const { data, error } = await supabase.functions.invoke('connect-onboard', { body: {} });
    if (error) throw error;
    return ok({ url: data?.url ?? null, available: data?.available === true });
  } catch (e) {
    return fail({ url: null, available: false }, e);
  }
}

export async function getConnectStatus(): Promise<Result<ConnectStatus>> {
  try {
    const { data, error } = await supabase.functions.invoke('connect-status', { body: {} });
    if (error) throw error;
    return ok({
      available: data?.available === true,
      connected: data?.connected === true,
      payoutsEnabled: data?.payoutsEnabled === true,
      detailsSubmitted: data?.detailsSubmitted === true,
    });
  } catch (e) {
    return fail({ available: false }, e);
  }
}

/** Company: send a queued payout to the worker's Connect account. */
export async function releasePayout(payoutId: string): Promise<Result<{ status: string; transfer_id?: string }>> {
  try {
    const { data, error } = await supabase.functions.invoke('release-payout', { body: { payout_id: payoutId } });
    if (error) throw error;
    if (data?.error) return fail({ status: 'error' }, new Error(data.error));
    return ok({ status: data?.status ?? 'unknown', transfer_id: data?.transfer_id });
  } catch (e) {
    return fail({ status: 'error' }, e);
  }
}
