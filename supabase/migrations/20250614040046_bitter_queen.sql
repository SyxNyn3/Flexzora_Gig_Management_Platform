/*
  # Fix handle_new_user trigger function

  1. Updates
    - Fix the handle_new_user function to properly handle user metadata
    - Ensure all required fields are populated with appropriate defaults
    - Add error handling to prevent signup failures

  2. Changes
    - Update trigger function to extract metadata safely
    - Provide default values for required NOT NULL fields
    - Handle cases where metadata might be missing
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Create updated handle_new_user function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    full_name,
    role,
    experience_years,
    is_available,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'fullName', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker')::user_role,
    0,
    true,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    -- Insert with minimal required data as fallback
    INSERT INTO public.profiles (
      user_id,
      email,
      full_name,
      role,
      experience_years,
      is_available,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      'User',
      'worker'::user_role,
      0,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Ensure the trigger function has proper permissions
GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;