import { useState, useEffect, useCallback } from 'react';
import { DatabaseService } from '@/lib/supabase';
import { ApiResponse } from '@/lib/types';
import { toast } from 'sonner';

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
        if (result.error !== 'No data found') {
          console.error(`Query error: ${result.error}`);
        }
        setData(result.data);
      } else {
        setData(result.data);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setData(null);
      console.error('Query exception:', err);
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
export function useProfile(userId: string | undefined | null) {
  return useSupabaseQuery(
    () => userId ? DatabaseService.getProfile(userId) : Promise.resolve({ data: null, error: 'No user ID provided' }),
    [userId]
  );
}

export function useSkills() {
  return useSupabaseQuery(
    () => DatabaseService.getSkills(),
    []
  );
}

export function useWorkerSkills(workerId: string | undefined | null) {
  return useSupabaseQuery(
    () => workerId ? DatabaseService.getWorkerSkills(workerId) : Promise.resolve({ data: [], error: 'No worker ID provided' }),
    [workerId]
  );
}

export function useCertifications(workerId: string | undefined | null) {
  return useSupabaseQuery(
    () => workerId ? DatabaseService.getCertifications(workerId) : Promise.resolve({ data: [], error: 'No worker ID provided' }),
    [workerId]
  );
}

export function useGigs(filters?: { status?: string; location?: string; search?: string }) {
  return useSupabaseQuery(
    () => DatabaseService.getGigs(filters),
    [filters?.status, filters?.location, filters?.search]
  );
}

export function useGig(gigId: string | undefined | null) {
  return useSupabaseQuery(
    () => gigId ? DatabaseService.getGig(gigId) : Promise.resolve({ data: null, error: 'No gig ID provided' }),
    [gigId]
  );
}

export function useApplications(filters?: { workerId?: string; gigId?: string; status?: string }) {
  return useSupabaseQuery(
    () => DatabaseService.getApplications(filters),
    [filters?.workerId, filters?.gigId, filters?.status]
  );
}

export function useCalendarEvents(userId: string | undefined | null, startDate?: string, endDate?: string) {
  return useSupabaseQuery(
    () => userId ? DatabaseService.getCalendarEvents(userId, startDate, endDate) : Promise.resolve({ data: [], error: 'No user ID provided' }),
    [userId, startDate, endDate]
  );
}

export function useExpenses(filters?: { workerId?: string; gigId?: string; startDate?: string; endDate?: string }) {
  return useSupabaseQuery(
    () => DatabaseService.getExpenses(filters),
    [filters?.workerId, filters?.gigId, filters?.startDate, filters?.endDate]
  );
}

export function usePayments(filters?: { workerId?: string; companyId?: string; gigId?: string; status?: string }) {
  return useSupabaseQuery(
    () => DatabaseService.getPayments(filters),
    [filters?.workerId, filters?.companyId, filters?.gigId, filters?.status]
  );
}

export function useNotifications(userId: string | undefined | null) {
  return useSupabaseQuery(
    () => userId ? DatabaseService.getNotifications(userId) : Promise.resolve({ data: [], error: 'No user ID provided' }),
    [userId]
  );
}

// Hook for fetching reviews for a worker
export function useReviewsForWorker(workerId: string | undefined | null) {
  // Return empty data for now since reviews table doesn't exist yet
  return { data: [], error: null, loading: false, refetch: async () => {} };
}

// Hook for fetching a single review
export function useReview(reviewId: string | undefined | null) {
  return useSupabaseQuery(
    () => reviewId ? DatabaseService.getReview(reviewId) : Promise.resolve({ data: null, error: 'No review ID provided' }),
    [reviewId]
  );
}

// Hook for real-time notifications
export function useRealtimeNotifications(userId: string | undefined | null, onNewNotification?: (notification: any) => void) {
  const [notifications, setNotifications] = useState<any[]>([]);
  
  useEffect(() => {
    if (!userId) return;
    
    // Initial fetch
    const fetchNotifications = async () => {
      const { data, error } = await DatabaseService.getNotifications(userId);
      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }
      setNotifications(data || []);
    };
    
    fetchNotifications();
    
    // Set up real-time subscription
    const subscription = DatabaseService.subscribeToNotifications(userId, (payload) => {
      const newNotification = payload.new;
      setNotifications(prev => [newNotification, ...prev]);
      
      // Call the callback if provided
      if (onNewNotification) {
        onNewNotification(newNotification);
        toast.info(newNotification.title, {
          description: newNotification.message,
        });
      }
    });
    
    return () => {
      // Clean up subscription
      subscription.unsubscribe();
    };
  }, [userId, onNewNotification]);
  
  return { notifications };
}