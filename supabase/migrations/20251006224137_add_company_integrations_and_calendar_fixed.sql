/*
  # Add Company Integrations and Calendar Events

  1. New Tables
    - `company_integrations` - Third-party integrations for workers
    - `calendar_events` - Calendar events for scheduling

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users

  3. Features
    - Integration status tracking
    - Calendar event management
*/

-- Create integration_status enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE integration_status AS ENUM ('connected', 'pending', 'error', 'disconnected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Company integrations table
CREATE TABLE IF NOT EXISTS company_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_type text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  all_day boolean DEFAULT false,
  color text DEFAULT '#3B82F6',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CREATE INDEX IF NOT EXISTSes
CREATE INDEX IF NOT EXISTS idx_company_integrations_worker_id ON company_integrations(worker_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

-- Enable Row Level Security
ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_integrations
DROP POLICY IF EXISTS "Workers can manage own integrations" ON company_integrations;
DROP POLICY IF EXISTS "Workers can manage own integrations" ON company_integrations;
CREATE POLICY "Workers can manage own integrations" ON company_integrations FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = company_integrations.worker_id AND profiles.user_id = auth.uid()));

-- RLS Policies for calendar_events
DROP POLICY IF EXISTS "Users can manage own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can manage own calendar events" ON calendar_events;
CREATE POLICY "Users can manage own calendar events" ON calendar_events FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = calendar_events.user_id AND profiles.user_id = auth.uid()));

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_company_integrations_updated_at ON company_integrations;
CREATE OR REPLACE TRIGGER update_company_integrations_updated_at
BEFORE UPDATE ON company_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE OR REPLACE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON calendar_events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();