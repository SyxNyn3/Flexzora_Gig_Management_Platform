// CalendarFeedService — create/revoke/list capability-URL ICS feeds.
import { supabase } from '@/lib/supabase';
import { CalendarFeed, CalendarFeedScope } from '@/lib/types';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export class CalendarFeedService {
  static feedUrl(feed: Pick<CalendarFeed, 'token'>): string {
    const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    return `${base}/functions/v1/ics-feed?token=${feed.token}`;
  }

  static async list(companyId: string): Promise<Result<CalendarFeed[]>> {
    try {
      const { data, error } = await supabase
        .from('calendar_feeds')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok((data ?? []) as CalendarFeed[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async create(input: {
    company_id: string;
    created_by: string;
    scope: CalendarFeedScope;
    event_id?: string;
    staff_id?: string;
    worker_id?: string;
    label?: string;
  }): Promise<Result<CalendarFeed | null>> {
    try {
      const { data, error } = await supabase
        .from('calendar_feeds')
        .insert({
          company_id: input.company_id,
          created_by: input.created_by,
          scope: input.scope,
          event_id: input.event_id ?? null,
          staff_id: input.staff_id ?? null,
          worker_id: input.worker_id ?? null,
          label: input.label?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return ok(data as CalendarFeed);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async setActive(id: string, isActive: boolean): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('calendar_feeds').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }
}
