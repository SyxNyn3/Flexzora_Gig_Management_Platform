// OpsService — kanban tasks + the auto-unfilled sweep.
import { supabase } from '@/lib/supabase';
import { OpsColumn, OpsPriority, OpsTask } from '@/lib/types';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

const TASK_SELECT = '*, event:events(id, name), shift:shifts(id, title), assignee:staff_members(*)';

export class OpsService {
  static async listTasks(companyId: string): Promise<Result<OpsTask[]>> {
    try {
      const { data, error } = await supabase
        .from('ops_tasks')
        .select(TASK_SELECT)
        .eq('company_id', companyId)
        .order('sort_order')
        .order('created_at')
        .limit(500);
      if (error) throw error;
      return ok((data ?? []) as OpsTask[]);
    } catch (e) {
      return fail([], e);
    }
  }

  /** Idempotent — creates urgent cards for short-staffed calls, resolves filled ones. */
  static async sweepUnfilled(companyId: string): Promise<Result<{ created: number; resolved: number }>> {
    try {
      const { data, error } = await supabase.rpc('generate_unfilled_tasks', { p_company_id: companyId });
      if (error) throw error;
      const res = data as { created?: number; resolved?: number } | null;
      return ok({ created: res?.created ?? 0, resolved: res?.resolved ?? 0 });
    } catch (e) {
      return fail({ created: 0, resolved: 0 }, e);
    }
  }

  static async createTask(input: {
    company_id: string;
    created_by: string;
    title: string;
    notes?: string | null;
    column_key?: OpsColumn;
    priority?: OpsPriority;
    event_id?: string | null;
    assigned_staff_id?: string | null;
    due_at?: string | null;
  }): Promise<Result<OpsTask | null>> {
    try {
      const { data, error } = await supabase.from('ops_tasks').insert(input).select(TASK_SELECT).single();
      if (error) throw error;
      return ok(data as OpsTask);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async updateTask(
    id: string,
    patch: Partial<Pick<OpsTask, 'title' | 'notes' | 'priority' | 'assigned_staff_id' | 'due_at' | 'sort_order'>>,
  ): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('ops_tasks').update(patch).eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async moveTask(id: string, column: OpsColumn): Promise<Result<boolean>> {
    try {
      const { error } = await supabase
        .from('ops_tasks')
        .update({ column_key: column, done_at: column === 'done' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async deleteTask(id: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('ops_tasks').delete().eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }
}
