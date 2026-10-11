import { supabase } from '@/lib/supabase';
import { CrewDistance } from '@/lib/types';

/**
 * Distance-ranked pool suggestions: crew_pool_distances returns km/detour_km
 * for pinned rides (home→pickup detour), bunks and food runs (→venue). Rows
 * without pins emit nothing and just sort last.
 */

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export async function listCrewDistances(shiftId: string): Promise<Result<CrewDistance[]>> {
  try {
    const { data, error } = await supabase.rpc('crew_pool_distances', { p_shift_id: shiftId });
    if (error) throw error;
    return ok((data ?? []) as CrewDistance[]);
  } catch (e) {
    return fail([], e);
  }
}
