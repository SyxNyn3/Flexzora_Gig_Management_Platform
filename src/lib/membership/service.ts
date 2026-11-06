// MembershipService — company member administration (company_members).
//
// All writes go through SECURITY DEFINER RPCs; company_members itself is
// SELECT-only for API roles. The RPCs enforce owner/admin authorization,
// the last-owner guard, and the 50-member cap server-side, so this service
// is a thin typed wrapper that surfaces Postgres error messages verbatim —
// the UI toasts them directly.
import { supabase } from '@/lib/supabase';
import { CompanyMemberEntry, CompanyMemberRole } from '@/lib/types';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

export class MembershipService {
  /** Roster for a company. Any member (incl. staff) may call this. */
  static async listMembers(companyId: string): Promise<Result<CompanyMemberEntry[]>> {
    try {
      const { data, error } = await supabase.rpc('company_members_list', { p_company_id: companyId });
      if (error) throw error;
      return ok((data ?? []) as CompanyMemberEntry[]);
    } catch (e) {
      return fail([], e);
    }
  }

  /** Add an existing Flexzora account by email. Owner/admin only (enforced in the RPC). */
  static async addMember(
    companyId: string,
    email: string,
    memberRole: CompanyMemberRole = 'staff',
  ): Promise<Result<string | null>> {
    try {
      const { data, error } = await supabase.rpc('add_company_member', {
        p_company_id: companyId,
        p_email: email,
        p_member_role: memberRole,
      });
      if (error) throw error;
      return ok((data as string | null) ?? null);
    } catch (e) {
      return fail(null, e);
    }
  }

  /** Change a member's role. Owner/admin only; last-owner guard applies. */
  static async updateMemberRole(
    companyId: string,
    profileId: string,
    memberRole: CompanyMemberRole,
  ): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.rpc('update_company_member_role', {
        p_company_id: companyId,
        p_profile_id: profileId,
        p_member_role: memberRole,
      });
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  /**
   * Remove a member. Owner/admin may remove others; anyone may remove
   * themselves (leave company). Last-owner guard applies to every path.
   */
  static async removeMember(companyId: string, profileId: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.rpc('remove_company_member', {
        p_company_id: companyId,
        p_profile_id: profileId,
      });
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }
}
