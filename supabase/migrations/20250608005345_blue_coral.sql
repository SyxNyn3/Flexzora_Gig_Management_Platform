/*
  # Flexora Platform Database Schema

  1. New Tables
    - `profiles` - User profiles with worker details
    - `gigs` - Gig/job postings and assignments
    - `skills` - Available skills for workers
    - `worker_skills` - Many-to-many relationship between workers and skills
    - `certifications` - Worker certifications and licenses
    - `payments` - Payment tracking for gigs
    - `expenses` - Expense tracking with receipts
    - `notifications` - Real-time notifications system
    - `gig_applications` - Applications for gigs
    - `companies` - Companies that post gigs
    - `availability` - Worker availability schedules

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Role-based access control for admin/user roles

  3. Features
    - Comprehensive user profiles
    - Gig management with status tracking
    - Financial tracking and reporting
    - Notification system
    - Skills and certification management
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User roles enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'worker', 'company');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Gig status enum
DO $$ BEGIN
  CREATE TYPE gig_status AS ENUM ('draft', 'published', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Application status enum
DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment status enum
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Expense category enum
DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM ('travel', 'equipment', 'meals', 'accommodation', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  role user_role DEFAULT 'worker',
  phone text,
  location text,
  bio text,
  hourly_rate decimal(10,2),
  experience_years integer DEFAULT 0,
  portfolio_url text,
  linkedin_url text,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
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
  hourly_rate decimal(10,2),
  total_budget decimal(10,2),
  status gig_status DEFAULT 'draft',
  required_workers integer DEFAULT 1,
  skills_required text[], -- Array of skill names
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
  proposed_rate decimal(10,2),
  application_date timestamptz DEFAULT now(),
  response_date timestamptz,
  notes text,
  UNIQUE(gig_id, worker_id)
);

-- Worker availability table
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
  amount decimal(10,2) NOT NULL,
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
  amount decimal(10,2) NOT NULL,
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

-- Insert default skills
INSERT INTO skills (name, category, description) VALUES
  ('Lighting Technician', 'Technical', 'Setting up and operating lighting equipment'),
  ('Sound Engineer', 'Technical', 'Audio setup and mixing'),
  ('Camera Operator', 'Technical', 'Operating cameras for events and productions'),
  ('Event Coordinator', 'Management', 'Coordinating event logistics'),
  ('Stage Manager', 'Management', 'Managing stage operations and crew'),
  ('Rigger', 'Technical', 'Setting up rigging and structural support'),
  ('Video Editor', 'Post-Production', 'Editing and post-processing video content'),
  ('Live Streaming', 'Technical', 'Managing live broadcast operations'),
  ('Security', 'Operations', 'Event security and crowd control'),
  ('Catering', 'Services', 'Food and beverage service');

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

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- RLS Policies for companies
DROP POLICY IF EXISTS "Anyone can view companies" ON companies;
CREATE POLICY "Anyone can view companies" ON companies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Company admins can manage companies" ON companies;
CREATE POLICY "Company admins can manage companies" ON companies FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'company')
);

-- RLS Policies for skills
DROP POLICY IF EXISTS "Anyone can view skills" ON skills;
CREATE POLICY "Anyone can view skills" ON skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage skills" ON skills;
CREATE POLICY "Admins can manage skills" ON skills FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
);

-- RLS Policies for worker_skills
DROP POLICY IF EXISTS "Anyone can view worker skills" ON worker_skills;
CREATE POLICY "Anyone can view worker skills" ON worker_skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Workers can manage own skills" ON worker_skills;
CREATE POLICY "Workers can manage own skills" ON worker_skills FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid())
);

-- RLS Policies for certifications
DROP POLICY IF EXISTS "Anyone can view certifications" ON certifications;
CREATE POLICY "Anyone can view certifications" ON certifications FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Workers can manage own certifications" ON certifications;
CREATE POLICY "Workers can manage own certifications" ON certifications FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid())
);

-- RLS Policies for gigs
DROP POLICY IF EXISTS "Anyone can view published gigs" ON gigs;
CREATE POLICY "Anyone can view published gigs" ON gigs FOR SELECT TO authenticated USING (status = 'published' OR status = 'completed');
DROP POLICY IF EXISTS "Companies can manage own gigs" ON gigs;
CREATE POLICY "Companies can manage own gigs" ON gigs FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = created_by AND profiles.user_id = auth.uid())
);

-- RLS Policies for gig_applications
DROP POLICY IF EXISTS "Workers can view own applications" ON gig_applications;
CREATE POLICY "Workers can view own applications" ON gig_applications FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Companies can view applications to their gigs" ON gig_applications;
CREATE POLICY "Companies can view applications to their gigs" ON gig_applications FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM gigs 
    JOIN profiles ON profiles.id = gigs.created_by 
    WHERE gigs.id = gig_id AND profiles.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Workers can manage own applications" ON gig_applications;
CREATE POLICY "Workers can manage own applications" ON gig_applications FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid())
);

-- RLS Policies for availability
DROP POLICY IF EXISTS "Workers can manage own availability" ON availability;
CREATE POLICY "Workers can manage own availability" ON availability FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid())
);

-- RLS Policies for payments
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments" ON payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id IN (SELECT created_by FROM gigs WHERE gigs.id = gig_id) AND profiles.user_id = auth.uid())
);

-- RLS Policies for expenses
DROP POLICY IF EXISTS "Workers can manage own expenses" ON expenses;
CREATE POLICY "Workers can manage own expenses" ON expenses FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = worker_id AND profiles.user_id = auth.uid())
);

-- RLS Policies for notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = user_id AND profiles.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = user_id AND profiles.user_id = auth.uid())
);

-- Function to automatically create profile after user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', ''));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user profile creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE OR REPLACE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE OR REPLACE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE OR REPLACE TRIGGER update_certifications_updated_at BEFORE UPDATE ON certifications FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE OR REPLACE TRIGGER update_gigs_updated_at BEFORE UPDATE ON gigs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE OR REPLACE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE OR REPLACE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();