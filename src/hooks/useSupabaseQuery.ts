import { useState, useEffect, useCallback } from 'react';
import { DatabaseService } from '@/lib/supabase';
import { ApiResponse } from '@/lib/types';

export function useSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: string | null }>,
  dependencies: any[] = []
): ApiResponse<T> & { refetch: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await queryFn();
      
      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result.data);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { data, error, loading, refetch };
}

// Specific hooks for common queries
export function useProfile(userId: string) {
  return useSupabaseQuery(
    () => DatabaseService.getProfile(userId),
    [userId]
  );
}

export function useSkills() {
  return useSupabaseQuery(
    () => DatabaseService.getSkills(),
    []
  );
}

export function useWorkerSkills(workerId: string) {
  return useSupabaseQuery(
    () => DatabaseService.getWorkerSkills(workerId),
    [workerId]
  );
}

export function useCertifications(workerId: string) {
  return useSupabaseQuery(
    () => DatabaseService.getCertifications(workerId),
    [workerId]
  );
}

export function useGigs(filters?: { status?: string; location?: string; search?: string }) {
  return useSupabaseQuery(
    () => DatabaseService.getGigs(filters),
    [filters?.status, filters?.location, filters?.search]
  );
}

export function useGig(gigId: string) {
  return useSupabaseQuery(
    () => DatabaseService.getGig(gigId),
    [gigId]
  );
}

export function useApplications(filters?: { workerId?: string; gigId?: string; status?: string }) {
  return useSupabaseQuery(
    () => DatabaseService.getApplications(filters),
    [filters?.workerId, filters?.gigId, filters?.status]
  );
}

export function useCalendarEvents(userId: string, startDate?: string, endDate?: string) {
  return useSupabaseQuery(
    () => DatabaseService.getCalendarEvents(userId, startDate, endDate),
    [userId, startDate, endDate]
  );
}

export function useNotifications(userId: string) {
  return useSupabaseQuery(
    () => DatabaseService.getNotifications(userId),
    [userId]
  );
}