/*
  # Create waiting list table

  1. New Tables
    - `waiting_list`
      - `id` (uuid, primary key)
      - `email` (text, unique, not null)
      - `role_interest` (enum, not null)
      - `production_companies_worked_with` (text)
      - `past_communication_methods` (text)
      - `desired_features` (text)
      - `challenges` (text)
      - `referred_by_email` (text)
      - `referral_code` (text, unique, not null)
      - `created_at` (timestamptz)
      - `status` (enum, not null)
      - `referral_count` (integer)
  2. Security
    - Enable RLS on `waiting_list` table
    - Add policy for public to insert their own entries
    - Add policy for admins to view all entries
*/

-- Create enum types
DO $$ BEGIN
    CREATE TYPE waitlist_role_interest AS ENUM ('worker', 'company');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE waitlist_status AS ENUM ('pending', 'whitelisted', 'invited');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create waiting_list table
CREATE TABLE IF NOT EXISTS waiting_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role_interest waitlist_role_interest NOT NULL,
  production_companies_worked_with text,
  past_communication_methods text,
  desired_features text,
  challenges text,
  referred_by_email text,
  referral_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  status waitlist_status DEFAULT 'pending' NOT NULL,
  referral_count integer DEFAULT 0 NOT NULL
);

-- Enable Row Level Security
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

-- Create policy for public to insert their own entries
DROP POLICY IF EXISTS "Anyone can add themselves to the waiting list" ON waiting_list;
CREATE POLICY "Anyone can add themselves to the waiting list"
  ON waiting_list
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policy for admins to view all entries
DROP POLICY IF EXISTS "Admins can view all waiting list entries" ON waiting_list;
CREATE POLICY "Admins can view all waiting list entries"
  ON waiting_list
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create function to increment referral count
CREATE OR REPLACE FUNCTION increment_referral_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referred_by_email IS NOT NULL THEN
    UPDATE waiting_list
    SET referral_count = referral_count + 1
    WHERE email = NEW.referred_by_email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to increment referral count on new entry
DROP TRIGGER IF EXISTS after_waitlist_insert ON waiting_list;
CREATE TRIGGER after_waitlist_insert
AFTER INSERT ON waiting_list
FOR EACH ROW
EXECUTE FUNCTION increment_referral_count();

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_waiting_list_email ON waiting_list(email);

-- Create index on referral_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_waiting_list_referral_code ON waiting_list(referral_code);