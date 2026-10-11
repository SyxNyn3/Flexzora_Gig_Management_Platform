import { supabase } from '@/lib/supabase';
import { CrewPost, CrewPostCategory, CrewPostDirection } from '@/lib/types';

/**
 * CrewBoard — the shift's structured bulletin board.
 *
 * Posts carry a category + direction ('want'/'offer') and an optional amount.
 * Resolving a priced post names the fulfiller — the DB mints the crew_iou in
 * the right direction (want: author owes fulfiller; offer: fulfiller owes
 * author). A zero/no-amount resolution is a favor, no IOU.
 */

export interface NewCrewPost {
  shiftId: string;
  category: CrewPostCategory;
  direction: CrewPostDirection;
  title: string;
  body?: string;
  amountCents?: number;
  refId?: string;
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

export async function postToBoard(input: NewCrewPost): Promise<Result<CrewPost | null>> {
  try {
    const authorId = await myProfileId();
    if (!authorId) return fail(null, new Error('Not signed in'));
    const { data, error } = await supabase
      .from('crew_posts')
      .insert({
        shift_id: input.shiftId,
        author_worker_id: authorId,
        category: input.category,
        direction: input.direction,
        title: input.title,
        body: input.body ?? null,
        amount_cents: input.amountCents ?? null,
        ref_id: input.refId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return ok(data as CrewPost);
  } catch (e) {
    return fail(null, e);
  }
}

/** Resolve a post and name who fulfilled it — priced posts mint the IOU. */
export async function resolvePost(postId: string, fulfilledByWorkerId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase
      .from('crew_posts')
      .update({ status: 'resolved', fulfilled_by_worker_id: fulfilledByWorkerId })
      .eq('id', postId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

export async function closePost(postId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('crew_posts').update({ status: 'closed' }).eq('id', postId);
    if (error) throw error;
    return ok(true);
  } catch (e) {
    return fail(false, e);
  }
}

export async function listBoard(shiftId: string, category?: CrewPostCategory): Promise<Result<CrewPost[]>> {
  try {
    let q = supabase
      .from('crew_posts')
      .select('*, author:profiles!crew_posts_author_worker_id_fkey(id, full_name), fulfiller:profiles!crew_posts_fulfilled_by_worker_id_fkey(id, full_name)')
      .eq('shift_id', shiftId)
      .order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) throw error;
    return ok((data ?? []) as CrewPost[]);
  } catch (e) {
    return fail([], e);
  }
}
