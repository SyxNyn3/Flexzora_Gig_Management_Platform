// BroadcastService — compose/preview/send/history for company broadcasts.
// Audience resolution lives server-side in resolve_broadcast_audience() so the
// preview and the send share one answer.
import { supabase } from '@/lib/supabase';
import { Broadcast, BroadcastAudience, BroadcastRecipient } from '@/lib/types';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export interface BroadcastDraft {
  subject?: string;
  body: string;
  audience: BroadcastAudience;
  event_id?: string | null;
  shift_id?: string | null;
  include_staff: boolean;
}

export interface AudiencePreview {
  workers: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  total: number;
}

export class BroadcastService {
  static async list(companyId: string): Promise<Result<Broadcast[]>> {
    try {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ok((data ?? []) as Broadcast[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async recipients(broadcastId: string): Promise<Result<BroadcastRecipient[]>> {
    try {
      const { data, error } = await supabase
        .from('broadcast_recipients')
        .select('*, worker:profiles(full_name), staff:staff_members(full_name)')
        .eq('broadcast_id', broadcastId)
        .order('created_at');
      if (error) throw error;
      return ok(
        ((data ?? []) as (BroadcastRecipient & { worker?: { full_name: string } | null; staff?: { full_name: string } | null })[]).map((r) => ({
          ...r,
          worker_name: r.worker?.full_name,
          staff_name: r.staff?.full_name,
        })),
      );
    } catch (e) {
      return fail([], e);
    }
  }

  /** Same resolver send_broadcast uses — what you preview is what ships. */
  static async previewAudience(draft: Omit<BroadcastDraft, 'body' | 'subject'>, companyId: string): Promise<Result<AudiencePreview>> {
    try {
      const { data, error } = await supabase.rpc('resolve_broadcast_audience', {
        p_company_id: companyId,
        p_audience: draft.audience,
        p_event_id: draft.event_id ?? null,
        p_shift_id: draft.shift_id ?? null,
        p_include_staff: draft.include_staff,
      });
      if (error) throw error;
      const rows = (data ?? []) as { worker_id: string | null; staff_id: string | null }[];
      const workerIds = rows.map((r) => r.worker_id).filter((x): x is string => !!x);
      const staffIds = rows.map((r) => r.staff_id).filter((x): x is string => !!x);

      const [workers, staff] = await Promise.all([
        workerIds.length
          ? supabase.from('profiles').select('id, full_name').in('id', workerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
        staffIds.length
          ? supabase.from('staff_members').select('id, full_name').in('id', staffIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
      ]);
      return ok({
        workers: ((workers.data ?? []) as { id: string; full_name: string }[]).map((w) => ({ id: w.id, name: w.full_name })),
        staff: ((staff.data ?? []) as { id: string; full_name: string }[]).map((s) => ({ id: s.id, name: s.full_name })),
        total: rows.length,
      });
    } catch (e) {
      return fail({ workers: [], staff: [], total: 0 }, e);
    }
  }

  /** Create the draft, then send it — send_broadcast resolves + writes recipients. */
  static async createAndSend(companyId: string, createdBy: string, draft: BroadcastDraft): Promise<Result<Broadcast | null>> {
    try {
      const { data: b, error } = await supabase
        .from('broadcasts')
        .insert({
          company_id: companyId,
          created_by: createdBy,
          subject: draft.subject?.trim() || null,
          body: draft.body,
          audience: draft.audience,
          event_id: draft.event_id ?? null,
          shift_id: draft.shift_id ?? null,
          include_staff: draft.include_staff,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: sent, error: sendErr } = await supabase.rpc('send_broadcast', { p_broadcast_id: b.id });
      if (sendErr) throw sendErr;
      return ok({ ...(b as Broadcast), status: 'sent', recipient_count: (sent as { recipients?: number })?.recipients ?? 0 });
    } catch (e) {
      return fail(null, e);
    }
  }

  static async deleteDraft(id: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('broadcasts').delete().eq('id', id).eq('status', 'draft');
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }
}
