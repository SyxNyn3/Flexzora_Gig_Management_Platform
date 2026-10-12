// SmartAlerts — the worker's briefing feed.
//
// Briefing rows (gear/parking/departure) are generated DB-side when an
// assignment confirms. This module reads the feed, marks read state, and
// pulls the editable gear-checklist tables so the UI can show the packing
// list even before the briefing alert lands.

import { supabase } from '@/lib/supabase';
import { AlertPreference, CrewAlert, CrewAlertKind } from '@/lib/types';

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

export async function listMyAlerts(limit = 30): Promise<Result<CrewAlert[]>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail([], new Error('Not signed in'));
    const { data, error } = await supabase
      .from('crew_alerts')
      .select('*')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ok((data ?? []) as CrewAlert[]);
  } catch (e) {
    return fail([], e);
  }
}

export async function listShiftAlerts(shiftId: string): Promise<Result<CrewAlert[]>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail([], new Error('Not signed in'));
    const { data, error } = await supabase
      .from('crew_alerts')
      .select('*')
      .eq('worker_id', workerId)
      .eq('shift_id', shiftId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok((data ?? []) as CrewAlert[]);
  } catch (e) {
    return fail([], e);
  }
}

export async function markAlertRead(alertId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase
      .from('crew_alerts')
      .update({ read_at: new Date().toISOString() })
      .eq('id', alertId)
      .is('read_at', null);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

export async function markAllAlertsRead(): Promise<Result<boolean>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(false, new Error('Not signed in'));
    const { error } = await supabase
      .from('crew_alerts')
      .update({ read_at: new Date().toISOString() })
      .eq('worker_id', workerId)
      .is('read_at', null);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

/** Per-kind transport prefs. Absent rows mean defaults: push on, SMS off. */
export async function myAlertPreferences(): Promise<Result<AlertPreference[]>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail([], new Error('Not signed in'));
    const { data, error } = await supabase
      .from('alert_preferences')
      .select('*')
      .eq('worker_id', workerId);
    if (error) throw error;
    return ok((data ?? []) as AlertPreference[]);
  } catch (e) {
    return fail([], e);
  }
}

export async function setAlertPreference(
  kind: CrewAlertKind,
  patch: { push?: boolean; sms?: boolean },
): Promise<Result<boolean>> {
  try {
    const workerId = await myProfileId();
    if (!workerId) return fail(false, new Error('Not signed in'));
    const { error } = await supabase
      .from('alert_preferences')
      .upsert({ worker_id: workerId, kind, ...patch }, { onConflict: 'worker_id,kind' });
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

/** Packing list: base items + cert-derived items, deduped. */
export async function gearChecklist(certCodes: string[]): Promise<Result<string[]>> {
  try {
    const [base, cert] = await Promise.all([
      supabase.from('base_gear_items').select('item'),
      certCodes.length
        ? supabase.from('cert_gear_items').select('item').in('cert_code', certCodes)
        : Promise.resolve({ data: [] as { item: string }[], error: null }),
    ]);
    if (base.error) throw base.error;
    if ('error' in cert && cert.error) throw cert.error;
    const items = [...(base.data ?? []).map((r) => r.item), ...((cert.data ?? []) as { item: string }[]).map((r) => r.item)];
    return ok(Array.from(new Set(items)).sort());
  } catch (e) {
    return fail([], e);
  }
}
