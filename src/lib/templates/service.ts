// TemplateService — call packs (shift_templates). A pack is everything about a
// call except the time: role, headcount, cert gates, rate, typical length.
import { supabase } from '@/lib/supabase';
import type { ShiftFormData, ShiftTemplate } from '@/lib/types';

type Result<T> = { data: T | null; error: string | null };
const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(e: unknown): Result<T> => ({ data: null, error: e instanceof Error ? e.message : String(e) });

export class TemplateService {
  static async list(companyId: string): Promise<ShiftTemplate[]> {
    const { data } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    return (data ?? []) as ShiftTemplate[];
  }

  /** Save a shift form as a reusable pack (upserts by company+name). */
  static async savePack(companyId: string, name: string, form: ShiftFormData): Promise<Result<null>> {
    try {
      const minutes = Math.max(15, Math.round((new Date(form.ends_at).getTime() - new Date(form.starts_at).getTime()) / 60000));
      const { error } = await supabase.from('shift_templates').upsert(
        {
          company_id: companyId,
          name,
          role_name: form.role_name,
          skill_id: form.skill_id || null,
          min_proficiency: form.min_proficiency,
          required_cert_codes: form.required_cert_codes,
          headcount: form.headcount,
          hourly_rate: form.hourly_rate,
          duration_minutes: minutes,
          notes: form.notes || null,
        },
        { onConflict: 'company_id,name' },
      );
      if (error) throw error;
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  }

  static async remove(id: string): Promise<Result<null>> {
    try {
      const { error } = await supabase.from('shift_templates').delete().eq('id', id);
      if (error) throw error;
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  }
}
