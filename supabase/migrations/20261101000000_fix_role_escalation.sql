-- #45 CRITICAL — role self-assignment → admin / company takeover.
--
-- Two independent escalation paths existed:
--   A. handle_new_user() copied raw_user_meta_data.role straight into
--      profiles.role, so signUp({ data: { role: 'admin' } }) minted an admin.
--   B. The profiles UPDATE policy had no column restriction, so any user
--      could `UPDATE profiles SET role = 'admin' WHERE user_id = auth.uid()`.
-- A third amplifier: "Company admins can manage companies" was FOR ALL on
-- role = 'company' with no ownership scoping, so a self-promoted 'company'
-- user could rewrite created_by on ANY company and inherit owns_company().
--
-- Fix:
--   1. handle_new_user allowlists metadata role to worker|company; anything
--      else (incl. 'admin', garbage, missing) lands as 'worker'. Admin is only
--      ever set server-side (service role / SQL).
--   2. guard_profile_update() BEFORE UPDATE trigger: API roles can't change
--      role, user_id, email or average_rating. Service role / SQL bypass it.
--   3. profiles INSERT policy also forbids self-inserting an admin row.
--   4. companies: ownership-scoped INSERT/UPDATE/DELETE (created_by =
--      current_profile_id()), plus created_by immutable for API roles.
-- Additive only: policies are replaced by name, no columns/tables dropped.

-- ---------------------------------------------------------------------------
-- 1. Signup: allowlist the role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested text := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_role user_role;
BEGIN
  -- Only self-service roles are honoured from client metadata. 'admin' (or
  -- anything unrecognised) is never trusted from the signup payload.
  v_role := CASE WHEN v_requested IN ('worker', 'company')
                 THEN v_requested::user_role
                 ELSE 'worker'::user_role END;

  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'fullName',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    v_role
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

-- ---------------------------------------------------------------------------
-- 2. profiles: privileged columns are immutable through the API
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- service_role / postgres / SQL migrations may change anything
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Profile role cannot be changed by the account holder'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Profile identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Profile email follows the auth account and cannot be edited directly'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.average_rating IS DISTINCT FROM OLD.average_rating THEN
    RAISE EXCEPTION 'Rating is computed from reviews' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_update ON profiles;
CREATE TRIGGER profiles_guard_update BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_update();

-- The UPDATE policy itself stays ownership-scoped, but now also carries a
-- WITH CHECK so the row can't be re-pointed at another auth user.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. profiles INSERT: a user may only self-create a worker/company row
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role IN ('worker', 'company'));

-- ---------------------------------------------------------------------------
-- 4. companies: ownership, not role
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Company admins can manage companies" ON companies;

DROP POLICY IF EXISTS "company users create own companies" ON companies;
CREATE POLICY "company users create own companies" ON companies FOR INSERT TO authenticated
  WITH CHECK (
    created_by = current_profile_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = created_by AND p.role IN ('company', 'admin'))
  );

DROP POLICY IF EXISTS "owners update own companies" ON companies;
CREATE POLICY "owners update own companies" ON companies FOR UPDATE TO authenticated
  USING (created_by = current_profile_id())
  WITH CHECK (created_by = current_profile_id());

DROP POLICY IF EXISTS "owners delete own companies" ON companies;
CREATE POLICY "owners delete own companies" ON companies FOR DELETE TO authenticated
  USING (created_by = current_profile_id());

-- created_by is the ownership anchor every owns_company() check hangs off —
-- it never moves through the API.
CREATE OR REPLACE FUNCTION guard_company_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Company ownership cannot be transferred through the API'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS companies_guard_update ON companies;
CREATE TRIGGER companies_guard_update BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION guard_company_update();
