import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MarketplaceService } from '@/lib/marketplace/service';
import { Company, ProductionEvent } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseQuery } from './useSupabaseQuery';

function useListQuery<T>(queryFn: () => Promise<{ data: T[] | null; error: string | null }>, deps: unknown[]) {
  const q = useSupabaseQuery(queryFn, deps);
  return { ...q, data: q.data ?? ([] as T[]) };
}

/** Resolves the company owned by the signed-in production manager. */
export function useMyCompany() {
  const { profile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('created_by', profile.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    setCompany(data ?? null);
    setError(error?.message ?? null);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const createCompany = useCallback(
    async (name: string) => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from('companies')
        .insert({ name, created_by: profile.id, contact_email: profile.email })
        .select()
        .single();
      if (error) {
        setError(error.message);
        return null;
      }
      setCompany(data);
      return data as Company;
    },
    [profile?.id, profile?.email],
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
