import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, DatabaseService, isDemoMode } from '@/lib/supabase';
import { storeAuthData, getStoredAuthData, clearAuthData, refreshAuthToken, setupTokenRefresh, validateSession } from '@/lib/auth';
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

// Mock profile for demo mode
const createMockProfile = (email: string, role: string = 'worker'): Profile => ({
  id: 'demo-user-id',
  user_id: 'demo-user',
  email: email,
  full_name: role === 'company' ? 'FlexZora Demo Company' : 'FlexZora Demo User',
  avatar_url: '',
  role: role as any,
  phone: '+1 (555) 123-4567',
  location: 'San Francisco, CA',
  bio: role === 'company' 
    ? 'Leading event production company specializing in corporate events and entertainment.'
    : 'Experienced freelance professional with expertise in video production and event management.',
  hourly_rate: role === 'worker' ? 45 : undefined,
  experience_years: role === 'worker' ? 5 : 0,
  portfolio_url: role === 'worker' ? 'https://demo-portfolio.com' : undefined,
  linkedin_url: role === 'worker' ? 'https://linkedin.com/in/demo-user' : undefined,
  is_available: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

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
        if (isDemoMode) {
          // In demo mode, check localStorage for demo session
          const demoSession = localStorage.getItem('flexzora-demo-session'); 
          if (demoSession && mounted) { 
            try {
              const sessionData = JSON.parse(demoSession);
              setUser(sessionData.user);
              setSession(sessionData.session);
              setProfile(sessionData.profile || createMockProfile(sessionData.user.email, sessionData.user.role));
              console.log('Demo session restored:', sessionData.user.email);
            } catch (error) {
              console.error('Error parsing demo session:', error);
              localStorage.removeItem('flexora-demo-session');
            }
          }
          if (mounted) setLoading(false);
          return;
        }

        // First try to restore from localStorage for immediate UI update
        const { accessToken, user: storedUser, profile: storedProfile } = getStoredAuthData();
        
        if (accessToken && storedUser && mounted) {
          setUser(storedUser as User);
          if (storedProfile) {
            setProfile(storedProfile as Profile);
          }
        }
        
        // Then validate with Supabase
        const { data: { session: supabaseSession }, error } = await supabase.auth.getSession();
        
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
          setRefreshInterval(interval);
          
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

    if (!isDemoMode) {
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
    }

    return () => {
      mounted = false;
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      let profileData = null;
      let error = null;

      try {
        // First try to get existing profile
        let result = await DatabaseService.getProfile(userId);
        profileData = result.data;
        error = result.error;
        
        // If profile doesn't exist, try to create it
        if (!profileData && !error) {
          console.log('Profile not found, attempting to create...');
          result = await DatabaseService.getOrCreateProfile(userId);
          profileData = result.data;
          error = result.error;
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
    
    if (isDemoMode) {
      // In demo mode, get profile from localStorage
      const demoSession = localStorage.getItem('flexzora-demo-session');
      if (demoSession) {
        try {
          const sessionData = JSON.parse(demoSession);
          setProfile(sessionData.profile);
        } catch (error) {
          console.error('Error refreshing demo profile:', error);
        }
      }
      return;
    }

    await fetchProfile(user.id);
  };

  const signUp = async (email: string, password: string, userData: any) => {
    try {
      if (isDemoMode) {
        // Demo mode signup
        const mockUser = { id: 'demo-user', email, role: userData.role };
        const mockSession = { user: mockUser };
        const mockProfile = createMockProfile(email, userData.role);
        
        const sessionData = { 
          user: mockUser, 
          session: mockSession, 
          profile: mockProfile 
        };
        
        localStorage.setItem('flexzora-demo-session', JSON.stringify(sessionData));
        
        setUser(mockUser as User);
        setSession(mockSession as Session);
        setProfile(mockProfile);
        
        console.log('Demo signup successful:', email);
        return { data: { user: mockUser, session: mockSession }, error: null };
      }

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
      if (isDemoMode) {
        // Demo mode signin - allow any credentials for easy testing
        console.log('Demo mode: Allowing access with any credentials');
        
        const mockUser = { id: 'demo-user', email };
        const mockSession = { user: mockUser };
        
        // Determine role based on email or default to worker
        const role = email.includes('company') || email.includes('corp') ? 'company' : 'worker';
        const mockProfile = createMockProfile(email, role);
        
        const sessionData = { 
          user: mockUser, 
          session: mockSession, 
          profile: mockProfile 
        };
        
        localStorage.setItem('flexzora-demo-session', JSON.stringify(sessionData));
        
        setUser(mockUser as User);
        setSession(mockSession as Session);
        setProfile(mockProfile);
        
        console.log('Demo signin successful:', email, 'Role:', role);
        return { data: { user: mockUser, session: mockSession }, error: null };
      }

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
        return { 
          data: null, 
          error: { 
            message: isDemoMode 
              ? 'Invalid login credentials. For demo, use demo@flexzora.com / password' 
              : error.message 
          } 
        };
      }

      // Ensure profile exists after successful signin
      if (data.user) {
        try {
          await fetchProfile(data.user.id);
        } catch (profileError) {
          console.warn('Profile fetch failed after signin:', profileError);
        }
      }

      return { data, error: null };
    } catch (error: any) {
      console.error('Error in signIn:', error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      if (isDemoMode) {
        localStorage.removeItem('flexzora-demo-session'); 
        setUser(null);
        setSession(null);
        setProfile(null);
        console.log('Demo signout successful');
        return { error: null };
      }

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
      if (isDemoMode) {
        // In demo mode, update local profile state and persist to localStorage
        const updatedProfile = { ...profile, ...updates } as Profile;
        setProfile(updatedProfile);
        
        // Update localStorage with new profile data
        const currentSession = localStorage.getItem('flexzora-demo-session');
        if (currentSession) { 
          const sessionData = JSON.parse(currentSession);
          sessionData.profile = updatedProfile;
          localStorage.setItem('flexzora-demo-session', JSON.stringify(sessionData));
        }
        
        console.log('Demo profile updated:', updates);
        return { data: updatedProfile, error: null };
      }

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