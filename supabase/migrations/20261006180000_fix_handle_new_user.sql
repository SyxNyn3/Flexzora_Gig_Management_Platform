-- Fix handle_new_user for production signup.
-- The prior definition inserted into `profiles` unqualified; under gotrue's
-- search_path the lookup failed and signups errored with "Database error".
-- Qualify the table, pin search_path, honor the requested role, and never
-- let a profile insert failure abort auth user creation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'fullName',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'worker')::user_role
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.profiles (user_id, email, full_name, role)
    VALUES (NEW.id, COALESCE(NEW.email, ''), 'User', 'worker'::user_role)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
