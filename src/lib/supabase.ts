import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-key';

// Create a demo client that won't crash the app
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Disable persistence for demo mode
  },
});

// Mock auth functions for demo mode
const isDemoMode = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

if (isDemoMode) {
  console.log('Running in demo mode - Supabase not configured');
}

export const signUp = async (email: string, password: string, userData: any) => {
  if (isDemoMode) {
    // Return mock success for demo
    return { 
      data: { 
        user: { id: 'demo-user', email }, 
        session: null 
      }, 
      error: null 
    };
  }
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData,
    },
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  if (isDemoMode) {
    // Return mock success for demo
    return { 
      data: { 
        user: { id: 'demo-user', email }, 
        session: { user: { id: 'demo-user', email } } 
      }, 
      error: null 
    };
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signOut = async () => {
  if (isDemoMode) {
    return { error: null };
  }
  
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  if (isDemoMode) {
    return { user: null, error: null };
  }
  
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

export const getCurrentSession = async () => {
  if (isDemoMode) {
    return { session: null, error: null };
  }
  
  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
};