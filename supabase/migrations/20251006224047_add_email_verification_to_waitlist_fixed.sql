/*
  # Add Email Verification to Waitlist

  1. Schema Changes
    - Add `verification_token` column to `waiting_list` table
    - Add `verified_at` column to track when email was verified
    - Update `status` enum to include 'verified' status
    - Add index on verification_token for performance

  2. Security
    - Verification tokens are nullable and cleared after use
    - Status tracking ensures proper verification flow
*/

-- Add verification columns to waiting_list table
DO $$
BEGIN
  -- Add verification_token column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waiting_list' AND column_name = 'verification_token'
  ) THEN
    ALTER TABLE waiting_list ADD COLUMN verification_token text;
  END IF;
  
  -- Add verified_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waiting_list' AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE waiting_list ADD COLUMN verified_at timestamptz;
  END IF;
END $$;

-- Update waitlist_status enum to include 'verified'
DO $$
BEGIN
  -- Check if 'verified' value already exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'verified' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'waitlist_status'
    )
  ) THEN
    ALTER TYPE waitlist_status ADD VALUE 'verified';
  END IF;
END $$;

-- Add index on verification_token for performance
CREATE INDEX IF NOT EXISTS idx_waiting_list_verification_token 
ON waiting_list(verification_token) 
WHERE verification_token IS NOT NULL;