// StaffService — internal team members and their per-event assignments.
import { supabase } from '@/lib/supabase';
import { StaffAssignment, StaffAssignmentStatus, StaffEmploymentType, StaffMember } from '@/lib/types';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export interface StaffMemberInput {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  employment_type?: StaffEmploymentType;
  day_rate?: number | null;
  notes?: string | null;
}

export class StaffService {
  static async listMembers(companyId: string, includeInactive = false): Promise<Result<StaffMember[]>> {
    try {
      let q = supabase
        .from('staff_members')
        .select('*')
        .eq('company_id', companyId)
        .order('full_name');
      if (!includeInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return ok((data ?? []) as StaffMember[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async createMember(companyId: string, input: StaffMemberInput): Promise<Result<StaffMember | null>> {
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .insert({ company_id: companyId, ...input })
        .select()
        .single();
      if (error) throw error;
      return ok(data as StaffMember);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async updateMember(id: string, patch: Partial<StaffMemberInput> & { is_active?: boolean }): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('staff_members').update(patch).eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async deleteMember(id: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('staff_members').delete().eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  /** All staff assigned to an event, with member details joined. */
  static async listEventStaff(eventId: string): Promise<Result<StaffAssignment[]>> {
    try {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('*, member:staff_members(*)')
        .eq('event_id', eventId)
        .order('created_at');
      if (error) throw error;
      return ok((data ?? []) as StaffAssignment[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async assignToEvent(input: {
    company_id: string;
    staff_id: string;
    event_id: string;
    role_label?: string | null;
    call_time?: string | null;
    notes?: string | null;
  }): Promise<Result<StaffAssignment | null>> {
    try {
      const { data, error } = await supabase
        .from('staff_assignments')
        .insert(input)
        .select('*, member:staff_members(*)')
        .single();
      if (error) throw error;
      return ok(data as StaffAssignment);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async updateAssignment(
    id: string,
    patch: { role_label?: string | null; call_time?: string | null; status?: StaffAssignmentStatus; notes?: string | null },
  ): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('staff_assignments').update(patch).eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async removeAssignment(id: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('staff_assignments').delete().eq('id', id);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  /** Events a staff member is assigned to — feeds schedules, broadcasts, ICS. */
  static async memberSchedule(staffId: string): Promise<Result<StaffAssignment[]>> {
    try {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('*, event:events(id, name, starts_on, ends_on)')
        .eq('staff_id', staffId)
        .order('call_time');
      if (error) throw error;
      return ok((data ?? []) as unknown as StaffAssignment[]);
    } catch (e) {
      return fail([], e);
    }
  }
}
