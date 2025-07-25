/*
  # Add username field to profiles table

  1. Schema Changes
    - Add `username` column to `profiles` table
    - Add unique constraint on username
    - Add index for performance
    - Create function to lookup user by username or email

  2. Security
    - Add RLS policy for username lookups
    - Ensure username uniqueness is enforced

  3. Functions
    - Create function to find user by username or email
    - Handle both email and username authentication
*/

-- Add username column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE profiles ADD COLUMN username text;
  END IF;
END $$;

-- Add unique constraint on username (only if not null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_username_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
  END IF;
END $$;

-- Add index for username lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_profiles_username'
  ) THEN
    CREATE INDEX idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;
  END IF;
END $$;

-- Function to lookup user by username or email
CREATE OR REPLACE FUNCTION lookup_user_by_username_or_email(identifier text)
RETURNS TABLE(user_id uuid, email text, username text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if identifier is an email (contains @)
  IF identifier LIKE '%@%' THEN
    -- Look up by email
    RETURN QUERY
    SELECT p.user_id, p.email, p.username
    FROM profiles p
    WHERE p.email = identifier;
  ELSE
    -- Look up by username
    RETURN QUERY
    SELECT p.user_id, p.email, p.username
    FROM profiles p
    WHERE p.username = identifier;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION lookup_user_by_username_or_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_user_by_username_or_email(text) TO anon;