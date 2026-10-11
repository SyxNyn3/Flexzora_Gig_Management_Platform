// AlertService — company alerts inbox backed by the generate_company_alerts
// sweep (open/escalate/auto-resolve). All reads/writes under the caller's RLS.
import { supabase } from '@/lib/supabase';
import type { AlertStatus, CompanyAlert } from '@/lib/types';

export class AlertService {
  /** Runs the idempotent sweep, then returns the fresh inbox. */
  static async sweep(companyId: string): Promise<CompanyAlert[]> {
    const { error } = await supabase.rpc('generate_company_alerts', { p_company_id: companyId });
    if (error) return [];
    return AlertService.list(companyId, 'open');
  }

  static async list(companyId: string, status: AlertStatus | 'all' = 'open'): Promise<CompanyAlert[]> {
    let q = supabase
      .from('company_alerts')
      .select('*, event:events(id, name), shift:shifts(id, title, starts_at)')
      .eq('company_id', companyId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as CompanyAlert[];
  }

  static async setStatus(id: string, status: AlertStatus): Promise<boolean> {
    const { error } = await supabase
      .from('company_alerts')
      .update({ status, resolved_at: status === 'open' ? null : new Date().toISOString() })
      .eq('id', id);
    return !error;
  }
}
