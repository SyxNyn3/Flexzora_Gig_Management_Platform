// Test accounts for FlexZora platform
// This file provides pre-configured test accounts for development and testing

import { supabase } from './supabase';

// Test account credentials
export const testAccounts = {
  company: {
    email: 'company@flexzora.com',
    password: 'StageLight2025!',
    profile: {
      full_name: 'TechCorp Events',
      role: 'company',
      email: 'company@flexzora.com',
      username: 'techcorp',
      bio: 'Leading event production company specializing in corporate events and entertainment.',
      location: 'San Francisco, CA',
      phone: '+1 (555) 123-4567',
      avatar_url: '',
    }
  },
  freelancer: {
    email: 'freelancer@flexzora.com',
    password: 'CameraAction2025!',
    profile: {
      full_name: 'Alex Johnson',
      role: 'worker',
      email: 'freelancer@flexzora.com',
      username: 'alexjohnson',
      bio: 'Experienced camera operator and lighting technician with 5+ years in event production.',
      location: 'Los Angeles, CA',
      phone: '+1 (555) 987-6543',
      hourly_rate: 45,
      experience_years: 5,
      portfolio_url: 'https://portfolio.example.com',
      linkedin_url: 'https://linkedin.com/in/alexjohnson',
      is_available: true,
      avatar_url: '',
      portfolio_items: [
        {
          id: 'portfolio-1',
          title: 'Corporate Event Video Production',
          description: 'Lead camera operator for annual tech conference with multi-camera setup',
          category: 'Video',
          client: 'TechCorp Events',
          date_completed: '2023-11-15',
          image_url: 'https://images.pexels.com/photos/2608517/pexels-photo-2608517.jpeg',
          is_featured: true
        },
        {
          id: 'portfolio-2',
          title: 'Music Festival Lighting Design',
          description: 'Designed and operated lighting for main stage performances',
          category: 'Lighting',
          client: 'SoundWave Festival',
          date_completed: '2023-08-20',
          image_url: 'https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg',
          is_featured: false
        }
      ]
    }
  }
};

// Function to create a demo session for testing
export const createDemoSession = (accountType: 'company' | 'freelancer') => {
  const account = testAccounts[accountType];
  
  // Create a mock user and session
  const mockUser = { 
    id: `demo-${accountType}`, 
    email: account.email, 
    role: account.profile.role 
  };
  
  const mockSession = { 
    user: mockUser 
  };
  
  // Create session data with user, session and profile
  const sessionData = { 
    user: mockUser, 
    session: mockSession, 
    profile: account.profile 
  };
  
  // Store in localStorage
  localStorage.setItem('flexzora-demo-session', JSON.stringify(sessionData));
  
  return sessionData;
};

// Function to sign in with a test account
export const signInWithTestAccount = async (accountType: 'company' | 'freelancer') => {
  // For demo mode, create a demo session
  if (true) { // Always use demo mode for test accounts
    const sessionData = createDemoSession(accountType);
    console.log(`Demo ${accountType} account signed in:`, sessionData);
    return { data: sessionData, error: null };
  }
  
  // In a real environment, this would use Supabase auth
  // const { data, error } = await supabase.auth.signInWithPassword({
  //   email: testAccounts[accountType].email,
  //   password: testAccounts[accountType].password,
  // });
  
  // return { data, error };
};