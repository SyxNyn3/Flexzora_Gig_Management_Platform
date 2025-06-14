import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase environment variables not found. Running in demo mode.');
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://demo.supabase.co',
  supabaseKey || 'demo-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);

// Helper function to check if we're in demo mode
export const isDemoMode = !supabaseUrl || !supabaseKey;

// Type-safe database operations
export class DatabaseService {
  // Profile operations
  static async getProfile(userId: string) {
    try {
      if (isDemoMode) {
        // In demo mode, return mock data
        return { 
          data: {
            id: 'demo-profile-id',
            user_id: userId,
            email: 'demo@flexora.com',
            full_name: 'Demo User',
            role: 'worker',
            experience_years: 5,
            is_available: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, 
          error: null 
        };
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch profile: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async getOrCreateProfile(userId: string): Promise<{ data: Profile | null; error: string | null }> {
    try {
      if (isDemoMode) {
        return { data: null, error: 'Demo mode - profiles handled in AuthContext' };
      }

      const { data, error } = await supabase.rpc('get_or_create_profile', { user_id: userId });
      
      if (error) {
        console.error('Error getting or creating profile:', error);
        return { data: null, error: error.message };
      }

      return { data: data as Profile, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async updateProfile(userId: string, updates: Partial<Database['public']['Tables']['profiles']['Update']>) {
    try {
      if (isDemoMode) {
        // In demo mode, return mock updated data
        return { 
          data: {
            id: 'demo-profile-id',
            user_id: userId,
            email: 'demo@flexora.com',
            ...updates,
            updated_at: new Date().toISOString()
          }, 
          error: null 
        };
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Skills operations
  static async getSkills() {
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch skills: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async getWorkerSkills(workerId: string) {
    try {
      const { data, error } = await supabase
        .from('worker_skills')
        .select(`
          *,
          skill:skills(*)
        `)
        .eq('worker_id', workerId);

      if (error) {
        throw new Error(`Failed to fetch worker skills: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async addWorkerSkill(skillData: Database['public']['Tables']['worker_skills']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('worker_skills')
        .insert(skillData)
        .select(`
          *,
          skill:skills(*)
        `)
        .single();

      if (error) {
        throw new Error(`Failed to add skill: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async removeWorkerSkill(workerSkillId: string) {
    try {
      const { error } = await supabase
        .from('worker_skills')
        .delete()
        .eq('id', workerSkillId);

      if (error) {
        throw new Error(`Failed to remove skill: ${error.message}`);
      }

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Certifications operations
  static async getCertifications(workerId: string) {
    try {
      const { data, error } = await supabase
        .from('certifications')
        .select('*')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch certifications: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async addCertification(certData: Database['public']['Tables']['certifications']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('certifications')
        .insert(certData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add certification: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async updateCertification(certId: string, updates: Database['public']['Tables']['certifications']['Update']) {
    try {
      const { data, error } = await supabase
        .from('certifications')
        .update(updates)
        .eq('id', certId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update certification: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async removeCertification(certId: string) {
    try {
      const { error } = await supabase
        .from('certifications')
        .delete()
        .eq('id', certId);

      if (error) {
        throw new Error(`Failed to remove certification: ${error.message}`);
      }

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Gigs operations
  static async getGigs(filters?: { status?: string; location?: string; search?: string }) {
    try {
      let query = supabase
        .from('gigs')
        .select(`
          *,
          company:companies(*),
          creator:profiles(*)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch gigs: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async getGig(gigId: string) {
    try {
      const { data, error } = await supabase
        .from('gigs')
        .select(`
          *,
          company:companies(*),
          creator:profiles(*)
        `)
        .eq('id', gigId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch gig: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async createGig(gigData: Database['public']['Tables']['gigs']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('gigs')
        .insert(gigData)
        .select(`
          *,
          company:companies(*),
          creator:profiles(*)
        `)
        .single();

      if (error) {
        throw new Error(`Failed to create gig: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Applications operations
  static async getApplications(filters?: { workerId?: string; gigId?: string; status?: string }) {
    try {
      let query = supabase
        .from('gig_applications')
        .select(`
          *,
          gig:gigs(*),
          worker:profiles(*)
        `)
        .order('application_date', { ascending: false });

      if (filters?.workerId) {
        query = query.eq('worker_id', filters.workerId);
      }

      if (filters?.gigId) {
        query = query.eq('gig_id', filters.gigId);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch applications: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async createApplication(appData: Database['public']['Tables']['gig_applications']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('gig_applications')
        .insert(appData)
        .select(`
          *,
          gig:gigs(*),
          worker:profiles(*)
        `)
        .single();

      if (error) {
        throw new Error(`Failed to create application: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async updateApplication(appId: string, updates: Database['public']['Tables']['gig_applications']['Update']) {
    try {
      const { data, error } = await supabase
        .from('gig_applications')
        .update(updates)
        .eq('id', appId)
        .select(`
          *,
          gig:gigs(*),
          worker:profiles(*)
        `)
        .single();

      if (error) {
        throw new Error(`Failed to update application: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Calendar events operations
  static async getCalendarEvents(userId: string, startDate?: string, endDate?: string) {
    try {
      let query = supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_time');

      if (startDate) {
        query = query.gte('start_time', startDate);
      }

      if (endDate) {
        query = query.lte('start_time', endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch calendar events: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async createCalendarEvent(eventData: Database['public']['Tables']['calendar_events']['Insert']) {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert(eventData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create calendar event: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async updateCalendarEvent(eventId: string, updates: Database['public']['Tables']['calendar_events']['Update']) {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update calendar event: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  static async deleteCalendarEvent(eventId: string) {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) {
        throw new Error(`Failed to delete calendar event: ${error.message}`);
      }

      // Return success response
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Notifications operations
  static async getNotifications(userId: string, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch notifications: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (error: any) {
      return { data: [], error: error.message };
    }
  }

  static async markNotificationAsRead(notificationId: string) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to mark notification as read: ${error.message}`);
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  // Real-time subscriptions
  static subscribeToNotifications(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        callback
      )
      .subscribe();
  }

  static subscribeToGigApplications(gigId: string, callback: (payload: any) => void) {
    return supabase
      .channel('gig_applications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gig_applications',
          filter: `gig_id=eq.${gigId}`
        },
        callback
      )
      .subscribe();
  }
}

// Error handling utilities
export const handleSupabaseError = (error: any): string => {
  if (!error) return 'An unknown error occurred';
  
  // Handle specific Supabase error codes
  switch (error.code) {
    case 'PGRST116':
      return 'No data found';
    case '23505':
      return 'This record already exists';
    case '23503':
      return 'Referenced record does not exist';
    case '42501':
      return 'You do not have permission to perform this action';
    default:
      return error.message || 'An error occurred';
  }
};

// Validation utilities
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateUrl = (url: string): boolean => {
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`);
    return true;
  } catch {
    return false;
  }
};

export const normalizeUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
};