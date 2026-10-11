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

-- REPLAY FIX: `follows` is created by 20250621122702_copper_credit.sql, a week
-- AFTER this file — on a clean replay the table doesn't exist yet and this
-- migration aborted the whole chain. copper_credit re-creates every policy
-- below, so skipping here when the table is absent loses nothing.
DO $follows_guard$
BEGIN
  IF to_regclass('public.follows') IS NULL THEN
    RAISE NOTICE 'follows table not yet created — skipping 20250614044750_mute_disk (recreated in 20250621122702)';
    RETURN;
  END IF;

  ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view their follow relationships" ON public.follows;
  CREATE POLICY "Users can view their follow relationships" ON public.follows
  FOR SELECT TO authenticated
  USING (
    follower_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR followed_user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

  DROP POLICY IF EXISTS "Users can create their own follows" ON public.follows;
  CREATE POLICY "Users can create their own follows" ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (follower_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

  DROP POLICY IF EXISTS "Users can delete their own follows" ON public.follows;
  CREATE POLICY "Users can delete their own follows" ON public.follows
  FOR DELETE TO authenticated
  USING (follower_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'follows_id_seq') THEN
    CREATE SEQUENCE IF NOT EXISTS public.follows_id_seq;
    ALTER TABLE public.follows ALTER COLUMN id SET DEFAULT nextval('public.follows_id_seq');
  END IF;
END $follows_guard$;
