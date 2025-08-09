import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Profile } from './types';
import { toast } from 'sonner';

// Token storage keys
const AUTH_TOKEN_KEY = 'flexzora-auth-token';
const AUTH_REFRESH_TOKEN_KEY = 'flexzora-refresh-token';
const AUTH_USER_KEY = 'flexzora-user';
const AUTH_PROFILE_KEY = 'flexzora-profile';

/**
 * Stores authentication data securely in localStorage
 */
export const storeAuthData = (session: Session | null, user: User | null, profile: Profile | null) => {
  if (session && user) {
    // Store tokens securely
    localStorage.setItem(AUTH_TOKEN_KEY, session.access_token);
    
    if (session.refresh_token) {
      localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, session.refresh_token);
    }
    
    // Store user data (excluding sensitive information)
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
    
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
    
    // Store profile data if available
    if (profile) {
      localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    }
  } else {
    // Clear auth data on logout or error
    clearAuthData();
  }
};

/**
 * Clears all authentication data from storage
 */
export const clearAuthData = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_PROFILE_KEY);
};

/**
 * Retrieves stored authentication data
 */
export const getStoredAuthData = () => {
  try {
    const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const refreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
    const userString = localStorage.getItem(AUTH_USER_KEY);
    const profileString = localStorage.getItem(AUTH_PROFILE_KEY);
    
    const user = userString ? JSON.parse(userString) : null;
    const profile = profileString ? JSON.parse(profileString) : null;
    
    return {
      accessToken,
      refreshToken,
      user,
      profile
    };
  } catch (error) {
    console.error('Error retrieving auth data:', error);
    clearAuthData();
    return { accessToken: null, refreshToken: null, user: null, profile: null };
  }
};

/**
 * Refreshes the authentication token
 */
export const refreshAuthToken = async (): Promise<boolean> => {
  try {
    const { refreshToken } = getStoredAuthData();
    
    if (!refreshToken) {
      return false;
    }
    
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    
    if (error || !data.session) {
      console.error('Error refreshing token:', error);
      clearAuthData();
      return false;
    }
    
    // Store the new tokens
    storeAuthData(data.session, data.user, null);
    return true;
  } catch (error) {
    console.error('Error in refreshAuthToken:', error);
    clearAuthData();
    return false;
  }
};

/**
 * Checks if the current session is valid and refreshes if needed
 */
export const validateSession = async (): Promise<boolean> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Error validating session:', error);
      return await refreshAuthToken();
    }
    
    if (!session) {
      return await refreshAuthToken();
    }
    
    return true;
  } catch (error) {
    console.error('Error in validateSession:', error);
    return false;
  }
};

/**
 * Sets up automatic token refresh
 */
export const setupTokenRefresh = () => {
  // Check token validity every 5 minutes
  const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  const refreshInterval = setInterval(async () => {
    const { accessToken } = getStoredAuthData();
    
    if (!accessToken) {
      clearInterval(refreshInterval);
      return;
    }
    
    await validateSession();
  }, REFRESH_INTERVAL);
  
  return refreshInterval;
};

/**
 * Lookup user by username or email
 */
export const lookupUserByIdentifier = async (identifier: string): Promise<{ email: string | null; error: string | null }> => {
  try {
    // Check if identifier is an email (contains @)
    if (identifier.includes('@')) {
      // It's already an email, return as-is
      return { email: identifier, error: null };
    }

    // It's a username, look it up via edge function
    const { data, error } = await supabase.functions.invoke('lookup-user', {
      body: { identifier },
    });

    if (error) {
      console.error('Error looking up user:', error);
      return { email: null, error: 'Failed to lookup user' };
    }

    if (!data || !data.email) {
      return { email: null, error: 'Username not found' };
    }

    return { email: data.email, error: null };
  } catch (error: any) {
    console.error('Error in lookupUserByIdentifier:', error);
    return { email: null, error: error.message || 'Unknown error occurred' };
  }
};