/*
  # Enable RLS on follows table and add policies

  1. Security
    - Enable Row Level Security (RLS) on the follows table
    - Add policies to allow users to manage their own follow relationships
    - Ensure proper security for follower and followed user relationships

  2. Policies
    - Allow users to view follows where they are the follower or followed
    - Allow users to create follows where they are the follower
    - Allow users to delete follows where they are the follower
*/

-- Enable Row Level Security on follows table
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Create policies for the follows table
-- Users can view follows where they are either the follower or the followed
CREATE POLICY "Users can view their follow relationships" 
ON public.follows
FOR SELECT
TO authenticated
USING (
  follower_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  ) OR 
  followed_user_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Users can create follows where they are the follower
CREATE POLICY "Users can create their own follows" 
ON public.follows
FOR INSERT
TO authenticated
WITH CHECK (
  follower_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Users can delete follows where they are the follower
CREATE POLICY "Users can delete their own follows" 
ON public.follows
FOR DELETE
TO authenticated
USING (
  follower_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Add auto-incrementing sequence for follows.id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'follows_id_seq'
  ) THEN
    CREATE SEQUENCE public.follows_id_seq;
    ALTER TABLE public.follows ALTER COLUMN id SET DEFAULT nextval('public.follows_id_seq');
  END IF;
END $$;