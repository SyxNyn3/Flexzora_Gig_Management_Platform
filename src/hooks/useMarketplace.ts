import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MarketplaceService } from '@/lib/marketplace/service';
import { Company, CompanyMembership, Payout, ProductionEvent } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseQuery } from './useSupabaseQuery';

function useListQuery<T>(queryFn: () => Promise<{ data: T[] | null; error: string | null }>, deps: unknown[]) {
  const q = useSupabaseQuery(queryFn, deps);
  return { ...q, data: q.data ?? ([] as T[]) };
}

// ---------------------------------------------------------------------------
// Company membership
// ---------------------------------------------------------------------------
// Company access is membership-based (public.company_members), NOT
// profiles.role and NOT companies.created_by. A worker-profile account can
// own/run a company under the same login. The my_company_memberships() RPC is
// SECURITY DEFINER and returns the caller's rows joined to company names.

// Module-level cache: RoleRoute gates mount once per company-route navigation
// and Navbar mounts on every page — without a shared in-flight promise each
// mount would fire its own RPC. Keyed by profile id so an account switch
// refetches instead of serving the previous user's memberships.
let membershipsCache: { profileId: string; promise: Promise<CompanyMembership[]> } | null = null;

function fetchMyCompanyMemberships(profileId: string): Promise<CompanyMembership[]> {
  if (membershipsCache?.profileId !== profileId) {
    const promise = (async () => {
      const { data, error } = await supabase.rpc('my_company_memberships');
      if (error) throw new Error(error.message);
      return (data ?? []) as CompanyMembership[];
    })();
    membershipsCache = { profileId, promise };
  }
  // Non-null: the branch above always assigns when the cache misses.
  return membershipsCache.promise;
}

/** Drop the cached memberships — call after creating a company so every
 *  consumer (RoleRoute gate, Navbar, checklists) sees the new membership. */
export function invalidateCompanyMemberships() {
  membershipsCache = null;
}

// Stable empty array: hooks return this while loading/absent so consumers can
// safely put `memberships` in effect deps without re-running every render.
const NO_MEMBERSHIPS: CompanyMembership[] = [];

/** The signed-in profile's company memberships ([] when none / signed out). */
export function useCompanyMemberships() {
  const { profile } = useAuth();
  const [memberships, setMemberships] = useState<CompanyMembership[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMyCompanyMemberships(profile.id)
      .then((rows) => {
        if (cancelled) return;
        setMemberships(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMemberships([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return { memberships: memberships ?? NO_MEMBERSHIPS, loading };
}

/** True when the signed-in profile holds ≥1 company membership. */
export function useHasCompanyMembership(): boolean {
  const { memberships } = useCompanyMemberships();
  return memberships.length > 0;
}

/**
 * Resolves the company the signed-in user operates. Membership-based: returns
 * the FIRST membership's company (multi-company workspace switching is a later
 * phase — the API shape stays single-company so callers don't change).
 */
export function useMyCompany() {
  const { profile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    // Membership first, then the company row itself (SELECT on companies is
    // open to any authenticated user, so this second read always succeeds).
    const { data: memberships, error: membershipError } = await supabase.rpc('my_company_memberships');
    if (membershipError) {
      setCompany(null);
      setError(membershipError.message);
      setLoading(false);
      return;
    }
    const first = (memberships ?? [])[0] as CompanyMembership | undefined;
    if (!first) {
      setCompany(null);
      setError(null);
      setLoading(false);
      return;
    }
    const { data, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', first.company_id)
      .maybeSingle();
    setCompany(data ?? null);
    setError(companyError?.message ?? null);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const createCompany = useCallback(
    async (name: string) => {
      if (!profile?.id) return null;
      // All company creation goes through the create_company RPC: it validates
      // the name, defaults contact_email to the profile email, writes the
      // company row AND the owner company_members row atomically. Direct
      // INSERT on companies is closed by RLS.
      const { data, error } = await supabase
        .rpc('create_company', { p_name: name })
        .single();
      if (error) {
        setError(error.message);
        return null;
      }
      if (!data) {
        setError('Company creation returned no row');
        return null;
      }
      invalidateCompanyMemberships();
      const created = data as Company;
      setCompany(created);
      return created;
    },
    [profile?.id],
  );

  return { company, loading, error, refetch: load, createCompany };
}

export function useEvents(companyId: string | undefined | null) {
  return useListQuery(
    () => (companyId ? MarketplaceService.getEvents(companyId) : Promise.resolve({ data: [] as ProductionEvent[], error: null })),
    [companyId],
  );
}

export function useEvent(eventId: string | undefined) {
  const query = useSupabaseQuery(
    () => (eventId ? MarketplaceService.getEvent(eventId) : Promise.resolve({ data: null, error: 'No event ID provided' })),
    [eventId],
  );

  useEffect(() => {
    if (!eventId) return;
    const channel = MarketplaceService.subscribeToEventShifts(eventId, () => query.refetch());
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return query;
}

export function useVenues(companyId: string | undefined | null) {
  return useListQuery(() => (companyId ? MarketplaceService.getVenues(companyId) : Promise.resolve({ data: [], error: null })), [companyId]);
}

export function useCertificationTypes() {
  return useListQuery(() => MarketplaceService.getCertificationTypes(), []);
}

export function useOvertimeRules() {
  return useListQuery(() => MarketplaceService.getOvertimeRules(), []);
}

export function useRoster(companyId: string | undefined | null) {
  return useListQuery(() => (companyId ? MarketplaceService.getRoster(companyId) : Promise.resolve({ data: [], error: null })), [companyId]);
}

export function useCompanyTimesheets(companyId: string | undefined | null) {
  return useListQuery(
    () => (companyId ? MarketplaceService.getCompanyTimesheets(companyId) : Promise.resolve({ data: [], error: null })),
    [companyId],
  );
}

export function useMarketplaceShifts(workerId: string | undefined | null) {
  return useListQuery(
    () => (workerId ? MarketplaceService.getMarketplaceShifts(workerId) : Promise.resolve({ data: [], error: null })),
    [workerId],
  );
}

export function useWorkerAssignments(workerId: string | undefined | null) {
  const query = useListQuery(
    () => (workerId ? MarketplaceService.getWorkerAssignments(workerId) : Promise.resolve({ data: [], error: null })),
    [workerId],
  );

  useEffect(() => {
    if (!workerId) return;
    const channel = MarketplaceService.subscribeToWorkerAssignments(workerId, () => query.refetch());
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  return query;
}

export function useInvoices(filter: { workerId?: string; companyId?: string; taxYear?: number }) {
  return useListQuery(
    () => (filter.workerId || filter.companyId ? MarketplaceService.getInvoices(filter) : Promise.resolve({ data: [], error: null })),
    [filter.workerId, filter.companyId, filter.taxYear],
  );
}

export function usePayouts(workerId: string | undefined | null) {
  return useListQuery(() => (workerId ? MarketplaceService.getPayouts(workerId) : Promise.resolve({ data: [], error: null })), [workerId]);
}

/** Company view of payouts issued on its invoices — feeds the release queue. */
export function useCompanyPayouts(companyId: string | undefined | null) {
  const q = useSupabaseQuery(async (): Promise<{ data: Payout[] | null; error: string | null }> => {
    if (!companyId) return { data: [] as Payout[], error: null };
    const { data, error } = await supabase
      .from('payouts')
      .select('*, invoice:invoices!inner(id, company_id, invoice_number, event:events(name), worker:profiles!invoices_worker_id_fkey(full_name)), payee:profiles!payouts_worker_id_fkey(full_name)')
      .eq('invoice.company_id', companyId)
      .order('created_at', { ascending: false });
    return { data: (data ?? null) as Payout[] | null, error: error?.message ?? null };
  }, [companyId]);
  return { ...q, data: q.data ?? ([] as Payout[]) };
}
