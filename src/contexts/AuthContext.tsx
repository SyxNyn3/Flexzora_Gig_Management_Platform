import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, DatabaseService } from '@/lib/supabase';
import { storeAuthData, getStoredAuthData, clearAuthData, setupTokenRefresh } from '@/lib/auth';
import { lookupUserByIdentifier } from '@/lib/auth';
import { Profile, Database } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, userData: any) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  updateProfile: (updates: Partial<Database['public']['Tables']['profiles']['Update']>) => Promise<any>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true); 
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const getInitialSession = async () => {
      try {
        // First try to restore from localStorage for immediate UI update
        const { accessToken, user: storedUser, profile: storedProfile } = getStoredAuthData();
        
        if (accessToken && storedUser && mounted) {
          setUser(storedUser as User);
          if (storedProfile) {
            setProfile(storedProfile as Profile);
          }
        }
        
        // Then validate with Supabase — bound the wait so a stalled refresh-token
        // exchange can't leave users on "Loading Flexora…" forever
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (!mounted) return;
        if (!sessionResult) {
          clearAuthData();
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        const { data: { session: supabaseSession }, error } = sessionResult;
        
        if (!mounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }
        
        setSession(supabaseSession);
        setUser(supabaseSession?.user ?? null);
        
        if (supabaseSession?.user) {
          // Store the session data
          storeAuthData(supabaseSession, supabaseSession.user, null);
          
          // Set up token refresh
          const interval = setupTokenRefresh();
          setRefreshInterval(interval as unknown as number);
          
          await fetchProfile(supabaseSession.user.id);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    getInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      console.log('Auth state changed:', event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);

      // Store or clear auth data based on session state
      if (session?.user) {
        storeAuthData(session, session.user, profile);
      } else {
        clearAuthData();
      }
      
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      
      // Clear refresh interval on unmount
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      let profileData = null;
      let error = null;

      try {
        // First try to get existing profile
        const result = await DatabaseService.getProfile(userId);
        profileData = result.data;
        error = result.error;
        
        // If profile doesn't exist, try to create it
        if (!profileData && !error) {
          console.log('Profile not found, attempting to create...');
          const createResult = await DatabaseService.getOrCreateProfile(userId);
          profileData = createResult.data;
          error = createResult.error;
        }
      } catch (err) {
        console.log('Profile not found, will create one on first update');
        // Profile doesn't exist yet, that's okay for new users
      }

      if (error && !error.includes('not found')) {
        console.error('Error fetching profile:', error);
        setLoading(false);
        return;
      }

      setProfile(profileData);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    
    await fetchProfile(user.id);
  };

  const signUp = async (email: string, password: string, userData: any) => {
    try {
      // Validate input data
      if (!userData.full_name || !userData.role) {
        return { 
          data: null, 
          error: { message: 'Full name and role are required' }
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
        },
      });

      if (error) {
        console.error('Supabase signup error:', error);
        return { data: null, error };
      }

      // If user was created but not confirmed, that's still success
      if (data.user && !data.user.email_confirmed_at) {
        console.log('User created successfully, email confirmation may be required');
      }

      // Try to fetch/create the profile after successful signup
      if (data.user) {
        try {
          await fetchProfile(data.user.id);
        } catch (profileError) {
          console.warn('Profile creation delayed, will retry on next login:', profileError);
        }
      }

      return { data, error: null };
    } catch (error: any) {
      console.error('Error in signUp:', error);
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Look up user by username or email
      const { email: userEmail, error: lookupError } = await lookupUserByIdentifier(email);
      
      if (lookupError) {
        console.error('User lookup error:', lookupError);
        return { 
          data: null, 
          error: { message: lookupError }
        };
      }
      
      if (!userEmail) {
        return { data: null, error: { message: 'User not found' } };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmail, // Use the looked-up email
        password,
      });

      if (error) {
        console.error('Supabase signin error:', error);
        return { data: null, error: { message: error.message } };
      }

      // Profile will be fetched automatically via onAuthStateChange

      return { data, error: null };
    } catch (error: any) {
      console.error('Error in signIn:', error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }
      
      // Clear auth data from storage
      clearAuthData();
      
      // Clear refresh interval
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }

      return { error: null };
    } catch (error: any) {
      console.error('Error in signOut:', error);
      return { error };
    }
  };

  const updateProfile = async (updates: Partial<Database['public']['Tables']['profiles']['Update']>) => {
    if (!user) return { error: 'No user logged in' };

    try {
      const { data, error } = await DatabaseService.updateProfile(user.id, updates);

      if (error) {
        throw new Error(error);
      }

      if (data) {
        setProfile(data);
        
        // Update stored profile data
        if (user) {
          const currentSession = await supabase.auth.getSession();
          if (currentSession.data.session) {
            storeAuthData(currentSession.data.session, user, data);
          }
        }
      }
      
      // Update stored profile data
      if (user && data) {
        const currentSession = await supabase.auth.getSession();
        if (currentSession.data.session) {
          storeAuthData(currentSession.data.session, user, data);
        }
      }

      return { data, error: null };
    } catch (error: any) {
      console.error('Error updating profile:', error);
      return { data: null, error: error.message };
    }
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};