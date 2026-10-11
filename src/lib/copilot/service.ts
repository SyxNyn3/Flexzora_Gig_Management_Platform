// CopilotService — docs CRUD, message persistence, and the whitelisted
// copilot_query RPC. All reads/writes are additionally fenced by RLS on
// owns_company; the RPC re-checks ownership server-side.
import { supabase } from '@/lib/supabase';
import { CompanyDoc, CopilotAction, CopilotMessage } from '@/lib/types';
import { QueryKind } from './intents';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export const COPILOT_ENABLED = import.meta.env.VITE_ENABLE_COPILOT === 'true' || import.meta.env.VITE_ENABLE_COPILOT === '1';

const PAGE_SIZE = 100;

export class CopilotService {
  // ---- company_docs ---------------------------------------------------------
  static async listDocs(companyId: string): Promise<Result<CompanyDoc[]>> {
    try {
      const { data, error } = await supabase
        .from('company_docs')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ok((data ?? []) as CompanyDoc[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async createDoc(doc: { company_id: string; title: string; body: string; tags?: string[]; created_by?: string }): Promise<Result<CompanyDoc | null>> {
    try {
      const { data, error } = await supabase.from('company_docs').insert(doc).select().single();
      if (error) throw error;
      return ok(data as CompanyDoc);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async updateDoc(id: string, patch: { title?: string; body?: string; tags?: string[] }): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('company_docs').update(patch).eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async deleteDoc(id: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('company_docs').delete().eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  /** Keyword-match docs for context cards — client-side so it stays cheap. */
  static matchDocs(docs: CompanyDoc[], text: string, limit = 3): CompanyDoc[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (!words.length) return [];
    return docs
      .map((d) => {
        const haystack = `${d.title} ${d.body} ${d.tags.join(' ')}`.toLowerCase();
        const score = words.reduce((a, w) => a + (haystack.includes(w) ? 1 : 0), 0);
        return { d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.d);
  }

  // ---- messages --------------------------------------------------------------
  static async listMessages(companyId: string): Promise<Result<CopilotMessage[]>> {
    try {
      const { data, error } = await supabase
        .from('copilot_messages')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return ok((data ?? []) as CopilotMessage[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async addMessage(msg: {
    company_id: string;
    profile_id?: string;
    role: 'user' | 'assistant';
    content: string;
    query_kind?: string;
    result?: Record<string, unknown>[];
    action?: CopilotAction;
  }): Promise<Result<CopilotMessage | null>> {
    try {
      const { data, error } = await supabase.from('copilot_messages').insert(msg).select().single();
      if (error) throw error;
      return ok(data as CopilotMessage);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async setActionStatus(id: string, action: CopilotAction): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('copilot_messages').update({ action }).eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async clearHistory(companyId: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('copilot_messages').delete().eq('company_id', companyId);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  // ---- whitelisted read catalog ----------------------------------------------
  static async query(companyId: string, kind: QueryKind, args: Record<string, unknown>): Promise<Result<Record<string, unknown>[]>> {
    try {
      const { data, error } = await supabase.rpc('copilot_query', {
        p_company_id: companyId,
        p_kind: kind,
        p_args: args,
      });
      if (error) throw error;
      return ok(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
    } catch (e) {
      return fail([], e);
    }
  }
}
