/*
  # Complete Flexora Database Schema

  1. New Tables
    - Enhanced profiles table with role-based fields
    - Companies table for company profiles
    - Skills and worker_skills for skill management
    - Certifications for worker credentials
    - Gigs table for job postings
    - Gig applications for worker applications
    - Payments and expenses for financial tracking
    - Notifications for real-time updates
    - Company integrations for external connections

  2. Security
    - Enable RLS on all tables
    - Add comprehensive policies for role-based access
    - Secure data access based on user roles

  3. Functions
    - Trigger functions for automatic profile creation
    - Update timestamp triggers
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types (only if they don't exist)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'worker', 'company');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gig_status AS ENUM ('draft', 'published', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_category AS ENUM ('travel', 'equipment', 'meals', 'accommodation', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE integration_status AS ENUM ('connected', 'pending', 'error', 'disconnected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Profiles table (enhanced)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  avatar_url text,
  role user_role DEFAULT 'worker',
  phone text,
  location text,
  bio text,
  hourly_rate numeric(10,2),
  experience_years integer DEFAULT 0,
  portfolio_url text,
  linkedin_url text,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  website_url text,
  contact_email text,
  contact_phone text,
  address text,
  logo_url text,
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Skills table
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  category text,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Worker skills junction table
CREATE TABLE IF NOT EXISTS worker_skills (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level integer CHECK (proficiency_level >= 1 AND proficiency_level <= 5) DEFAULT 3,
  years_experience integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(worker_id, skill_id)
);

-- Certifications table
CREATE TABLE IF NOT EXISTS certifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuing_organization text,
  issue_date date,
  expiration_date date,
  credential_id text,
  credential_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Gigs table
CREATE TABLE IF NOT EXISTS gigs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,
  location text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  hourly_rate numeric(10,2),
  total_budget numeric(10,2),
  status gig_status DEFAULT 'draft',
  required_workers integer DEFAULT 1,
  skills_required text[],
  equipment_provided text[],
  special_requirements text,
  is_remote boolean DEFAULT false,
  contact_info jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Gig applications table
CREATE TABLE IF NOT EXISTS gig_applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gig_id uuid REFERENCES gigs(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  status application_status DEFAULT 'pending',
  cover_letter text,
  proposed_rate numeric(10,2),
  application_date timestamptz DEFAULT now(),
  response_date timestamptz,
  notes text,
  UNIQUE(gig_id, worker_id)
);

-- Availability table
CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_available boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gig_id uuid REFERENCES gigs(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  status payment_status DEFAULT 'pending',
  due_date date,
  paid_date date,
  invoice_number text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  gig_id uuid REFERENCES gigs(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  category expense_category NOT NULL,
  description text NOT NULL,
  expense_date date NOT NULL,
  receipt_url text,
  is_reimbursable boolean DEFAULT false,
  is_tax_deductible boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info',
  read boolean DEFAULT false,
  action_url text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Company integrations table
CREATE TABLE IF NOT EXISTS company_integrations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  integration_type text NOT NULL,
  status integration_status DEFAULT 'pending',
  credentials jsonb,
  settings jsonb DEFAULT '{}',
  last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_type text NOT NULL, -- 'gig', 'note', 'reminder'
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  all_day boolean DEFAULT false,
  color text DEFAULT '#3B82F6',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CREATE INDEX IF NOT EXISTSes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_gigs_status ON gigs(status);
CREATE INDEX IF NOT EXISTS idx_gigs_created_by ON gigs(created_by);
CREATE INDEX IF NOT EXISTS idx_gig_applications_worker_id ON gig_applications(worker_id);
CREATE INDEX IF NOT EXISTS idx_gig_applications_gig_id ON gig_applications(gig_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Companies policies
DROP POLICY IF EXISTS "Anyone can view companies" ON companies;
DROP POLICY IF EXISTS "Company admins can manage companies" ON companies;

DROP POLICY IF EXISTS "Anyone can view companies" ON companies;
CREATE POLICY "Anyone can view companies" ON companies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Company admins can manage companies" ON companies;
CREATE POLICY "Company admins can manage companies" ON companies FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'company'));

-- Skills policies
DROP POLICY IF EXISTS "Anyone can view skills" ON skills;
DROP POLICY IF EXISTS "Admins can manage skills" ON skills;

DROP POLICY IF EXISTS "Anyone can view skills" ON skills;
CREATE POLICY "Anyone can view skills" ON skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage skills" ON skills;
CREATE POLICY "Admins can manage skills" ON skills FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'));

-- Worker skills policies
DROP POLICY IF EXISTS "Anyone can view worker skills" ON worker_skills;
DROP POLICY IF EXISTS "Workers can manage own skills" ON worker_skills;

DROP POLICY IF EXISTS "Anyone can view worker skills" ON worker_skills;
CREATE POLICY "Anyone can view worker skills" ON worker_skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Workers can manage own skills" ON worker_skills;
CREATE POLICY "Workers can manage own skills" ON worker_skills FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_skills.worker_id AND profiles.user_id = auth.uid()));

-- Certifications policies
DROP POLICY IF EXISTS "Anyone can view certifications" ON certifications;
DROP POLICY IF EXISTS "Workers can manage own certifications" ON certifications;

DROP POLICY IF EXISTS "Anyone can view certifications" ON certifications;
CREATE POLICY "Anyone can view certifications" ON certifications FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Workers can manage own certifications" ON certifications;
CREATE POLICY "Workers can manage own certifications" ON certifications FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = certifications.worker_id AND profiles.user_id = auth.uid()));

-- Gigs policies
DROP POLICY IF EXISTS "Anyone can view published gigs" ON gigs;
DROP POLICY IF EXISTS "Companies can manage own gigs" ON gigs;

DROP POLICY IF EXISTS "Anyone can view published gigs" ON gigs;
CREATE POLICY "Anyone can view published gigs" ON gigs FOR SELECT TO authenticated 
  USING (status = 'published' OR status = 'completed');
DROP POLICY IF EXISTS "Companies can manage own gigs" ON gigs;
CREATE POLICY "Companies can manage own gigs" ON gigs FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = gigs.created_by AND profiles.user_id = auth.uid()));

-- Gig applications policies
DROP POLICY IF EXISTS "Workers can view own applications" ON gig_applications;
DROP POLICY IF EXISTS "Workers can manage own applications" ON gig_applications;
DROP POLICY IF EXISTS "Companies can view applications to their gigs" ON gig_applications;

DROP POLICY IF EXISTS "Workers can view own applications" ON gig_applications;
CREATE POLICY "Workers can view own applications" ON gig_applications FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = gig_applications.worker_id AND profiles.user_id = auth.uid()));
DROP POLICY IF EXISTS "Workers can manage own applications" ON gig_applications;
CREATE POLICY "Workers can manage own applications" ON gig_applications FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = gig_applications.worker_id AND profiles.user_id = auth.uid()));
DROP POLICY IF EXISTS "Companies can view applications to their gigs" ON gig_applications;
CREATE POLICY "Companies can view applications to their gigs" ON gig_applications FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM gigs JOIN profiles ON profiles.id = gigs.created_by 
                 WHERE gigs.id = gig_applications.gig_id AND profiles.user_id = auth.uid()));

-- Availability policies
DROP POLICY IF EXISTS "Workers can manage own availability" ON availability;
DROP POLICY IF EXISTS "Workers can manage own availability" ON availability;
CREATE POLICY "Workers can manage own availability" ON availability FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = availability.worker_id AND profiles.user_id = auth.uid()));

-- Payments policies
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments" ON payments FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = payments.worker_id AND profiles.user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id IN (SELECT gigs.created_by FROM gigs WHERE gigs.id = payments.gig_id) AND profiles.user_id = auth.uid())
  );

-- Expenses policies
DROP POLICY IF EXISTS "Workers can manage own expenses" ON expenses;
DROP POLICY IF EXISTS "Workers can manage own expenses" ON expenses;
CREATE POLICY "Workers can manage own expenses" ON expenses FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = expenses.worker_id AND profiles.user_id = auth.uid()));

-- Notifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = notifications.user_id AND profiles.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = notifications.user_id AND profiles.user_id = auth.uid()));

-- Company integrations policies
DROP POLICY IF EXISTS "Workers can manage own integrations" ON company_integrations;
DROP POLICY IF EXISTS "Workers can manage own integrations" ON company_integrations;
CREATE POLICY "Workers can manage own integrations" ON company_integrations FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = company_integrations.worker_id AND profiles.user_id = auth.uid()));

-- Calendar events policies
DROP POLICY IF EXISTS "Users can manage own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can manage own calendar events" ON calendar_events;
CREATE POLICY "Users can manage own calendar events" ON calendar_events FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = calendar_events.user_id AND profiles.user_id = auth.uid()));

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
DROP TRIGGER IF EXISTS update_certifications_updated_at ON certifications;
DROP TRIGGER IF EXISTS update_gigs_updated_at ON gigs;
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
DROP TRIGGER IF EXISTS update_company_integrations_updated_at ON company_integrations;
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;

CREATE OR REPLACE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_certifications_updated_at BEFORE UPDATE ON certifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_gigs_updated_at BEFORE UPDATE ON gigs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_company_integrations_updated_at BEFORE UPDATE ON company_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker')::user_role
  );
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Insert some default skills
INSERT INTO skills (name, category) VALUES
  ('Camera Operation', 'Technical'),
  ('Lighting Design', 'Technical'),
  ('Sound Engineering', 'Technical'),
  ('Video Editing', 'Post-Production'),
  ('Event Coordination', 'Management'),
  ('Stage Management', 'Management'),
  ('Live Streaming', 'Technical'),
  ('Photography', 'Creative'),
  ('Rigging', 'Technical'),
  ('Safety Coordination', 'Safety')
ON CONFLICT (name) DO NOTHING;