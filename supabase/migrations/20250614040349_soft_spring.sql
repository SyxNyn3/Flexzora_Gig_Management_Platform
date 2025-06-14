/*
  # Fix Authentication and Profile Creation Issues

  1. Database Functions
    - Update the handle_new_user function to be more robust
    - Add proper error handling and logging
    
  2. Triggers
    - Ensure the trigger for creating profiles on user signup works correctly
    - Add safeguards against duplicate profile creation
    
  3. Security
    - Review and fix RLS policies that might be blocking profile creation
    - Ensure proper permissions for authenticated users
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role text;
  user_full_name text;
BEGIN
  -- Extract role and full_name from raw_user_meta_data
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'worker');
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  
  -- Insert profile with error handling
  BEGIN
    INSERT INTO public.profiles (
      user_id,
      email,
      full_name,
      role,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      user_full_name,
      user_role::user_role,
      NOW(),
      NOW()
    );
    
    RETURN NEW;
  EXCEPTION 
    WHEN unique_violation THEN
      -- Profile already exists, update it instead
      UPDATE public.profiles 
      SET 
        email = NEW.email,
        full_name = COALESCE(user_full_name, full_name),
        role = COALESCE(user_role::user_role, role),
        updated_at = NOW()
      WHERE user_id = NEW.id;
      
      RETURN NEW;
    WHEN OTHERS THEN
      -- Log the error but don't fail the user creation
      RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
      RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies to ensure they don't block profile creation
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Create more permissive policies for profile management
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- Allow service role to manage profiles (for triggers)
CREATE POLICY "Service role can manage profiles" ON profiles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure the profiles table has proper constraints
DO $$
BEGIN
  -- Add constraint to ensure user_id is unique if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
  
  -- Add constraint to ensure email is unique if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_email_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
  END IF;
END $$;

-- Create a function to safely get or create a profile
CREATE OR REPLACE FUNCTION public.get_or_create_profile(user_id uuid)
RETURNS profiles AS $$
DECLARE
  profile_record profiles;
  user_record auth.users;
BEGIN
  -- First try to get existing profile
  SELECT * INTO profile_record FROM profiles WHERE profiles.user_id = get_or_create_profile.user_id;
  
  IF FOUND THEN
    RETURN profile_record;
  END IF;
  
  -- Get user data from auth.users
  SELECT * INTO user_record FROM auth.users WHERE id = get_or_create_profile.user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Create new profile
  INSERT INTO profiles (
    user_id,
    email,
    full_name,
    role,
    created_at,
    updated_at
  ) VALUES (
    user_record.id,
    user_record.email,
    COALESCE(user_record.raw_user_meta_data->>'full_name', split_part(user_record.email, '@', 1)),
    COALESCE(user_record.raw_user_meta_data->>'role', 'worker')::user_role,
    NOW(),
    NOW()
  ) RETURNING * INTO profile_record;
  
  RETURN profile_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;