import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, userData: any) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  updateProfile: (updates: Partial<Profile>) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Mock profile for demo mode
const createMockProfile = (email: string): Profile => ({
  id: 'demo-user-id',
  user_id: 'demo-user',
  email: email,
  full_name: 'Demo User',
  avatar_url: '',
  role: 'worker',
  phone: '+1 (555) 123-4567',
  location: 'San Francisco, CA',
  bio: 'Experienced freelance professional with expertise in video production and event management.',
  hourly_rate: 45,
  experience_years: 5,
  portfolio_url: 'https://demo-portfolio.com',
  linkedin_url: 'https://linkedin.com/in/demo-user',
  is_available: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const isDemoMode = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    let mounted = true;

    const getInitialSession = async () => {
      try {
        if (isDemoMode) {
          // In demo mode, check localStorage for demo session
          const demoSession = localStorage.getItem('demo-session');
          if (demoSession && mounted) {
            const sessionData = JSON.parse(demoSession);
            setUser(sessionData.user);
            setSession(sessionData.session);
            setProfile(createMockProfile(sessionData.user.email));
          }
          if (mounted) setLoading(false);
          return;
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
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

    if (!isDemoMode) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        
        console.log('Auth state changed:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, [isDemoMode]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        setLoading(false);
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, userData: any) => {
    try {
      if (isDemoMode) {
        // Demo mode signup
        const mockUser = { id: 'demo-user', email };
        const mockSession = { user: mockUser };
        
        localStorage.setItem('demo-session', JSON.stringify({ user: mockUser, session: mockSession }));
        
        setUser(mockUser as User);
        setSession(mockSession as Session);
        setProfile(createMockProfile(email));
        
        return { data: { user: mockUser, session: mockSession }, error: null };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
        },
      });
      return { data, error };
    } catch (error) {
      console.error('Error in signUp:', error);
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      if (isDemoMode) {
        // Demo mode signin
        const mockUser = { id: 'demo-user', email };
        const mockSession = { user: mockUser };
        
        localStorage.setItem('demo-session', JSON.stringify({ user: mockUser, session: mockSession }));
        
        setUser(mockUser as User);
        setSession(mockSession as Session);
        setProfile(createMockProfile(email));
        
        return { data: { user: mockUser, session: mockSession }, error: null };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { data, error };
    } catch (error) {
      console.error('Error in signIn:', error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      if (isDemoMode) {
        localStorage.removeItem('demo-session');
        setUser(null);
        setSession(null);
        setProfile(null);
        return { error: null };
      }

      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      console.error('Error in signOut:', error);
      return { error };
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user logged in' };

    try {
      if (isDemoMode) {
        // In demo mode, update local profile state
        const updatedProfile = { ...profile, ...updates } as Profile;
        setProfile(updatedProfile);
        return { data: updatedProfile, error: null };
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (!error && data) {
        setProfile(data);
      }

      return { data, error };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { data: null, error };
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};