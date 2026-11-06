-- Membership management: owner/admin member administration for a company.
--
-- company_members (20261203000000_company_members.sql) is read-only to API
-- roles; every write goes through these SECURITY DEFINER RPCs, which enforce:
--   * caller must be a member of the target company (owner/admin for changes,
--     self for leaving),
--   * member_role stays inside owner/admin/staff,
--   * the company can never be left without an 'owner' (last-owner guard),
--   * company size is capped at 50 members.
--
-- Invite-by-email for people WITHOUT a Flexzora account is intentionally not
-- here: add_company_member only resolves existing profiles and errors clearly
-- otherwise. A separate invite flow can layer on top later.

-- ============================================================================
-- 1. add_company_member — owner/admin adds an existing account by email
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_company_member(
  p_company_id uuid,
  p_email text,
  p_member_role text DEFAULT 'staff'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_caller uuid;
  v_caller_role text;
  v_role text := lower(btrim(COALESCE(p_member_role, 'staff')));
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_profile_id uuid;
  v_member_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  v_caller := public.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No profile found for this account' USING ERRCODE = '42501';
  END IF;

  -- Only owners/admins manage membership; staff can read the roster but not
  -- change it.
  v_caller_role := public.my_company_role(p_company_id);
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners and admins can manage members' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Invalid member role: %', p_member_role USING ERRCODE = '22023';
  END IF;
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;

  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE lower(p.email) = v_email;
  IF v_profile_id IS NULL THEN
    -- Deliberate: we do not create auth users here. Invite-by-email for
    -- non-users is a separate flow; this error tells the admin exactly what
    -- to do (have them sign up first).
    RAISE EXCEPTION 'No Flexzora account for that email yet' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = p_company_id AND m.profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'That person is already a member of this company' USING ERRCODE = '22023';
  END IF;

  -- Cheap size guard: membership rows are the only thing that grants company
  -- access, so 50 members is a sane abuse ceiling.
  SELECT count(*) INTO v_member_count
  FROM public.company_members m WHERE m.company_id = p_company_id;
  IF v_member_count >= 50 THEN
    RAISE EXCEPTION 'This company has reached the member limit (50)' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.company_members (company_id, profile_id, member_role)
  VALUES (p_company_id, v_profile_id, v_role);

  RETURN v_profile_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.add_company_member(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_company_member(uuid, text, text) TO authenticated;

-- ============================================================================
-- 2. update_company_member_role — owner/admin changes a member's role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_company_member_role(
  p_company_id uuid,
  p_profile_id uuid,
  p_member_role text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_caller uuid;
  v_caller_role text;
  v_role text := lower(btrim(COALESCE(p_member_role, '')));
  v_target_role text;
  v_owner_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  v_caller := public.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No profile found for this account' USING ERRCODE = '42501';
  END IF;

  v_caller_role := public.my_company_role(p_company_id);
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners and admins can manage members' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Invalid member role: %', p_member_role USING ERRCODE = '22023';
  END IF;

  SELECT m.member_role INTO v_target_role
  FROM public.company_members m
  WHERE m.company_id = p_company_id AND m.profile_id = p_profile_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this company' USING ERRCODE = '22023';
  END IF;

  -- Last-owner guard: an owner may be demoted only while another owner
  -- remains. Self-demotion is allowed under the same rule (an owner handing
  -- off to a co-owner is legitimate; orphaning the company is not).
  IF v_target_role = 'owner' AND v_role <> 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM public.company_members m
    WHERE m.company_id = p_company_id AND m.member_role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of this company' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.company_members m
  SET member_role = v_role
  WHERE m.company_id = p_company_id AND m.profile_id = p_profile_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.update_company_member_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_company_member_role(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 3. remove_company_member — owner/admin removes a member; anyone may leave
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_company_member(
  p_company_id uuid,
  p_profile_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_caller uuid;
  v_caller_role text;
  v_target_role text;
  v_owner_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  v_caller := public.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No profile found for this account' USING ERRCODE = '42501';
  END IF;

  SELECT m.member_role INTO v_target_role
  FROM public.company_members m
  WHERE m.company_id = p_company_id AND m.profile_id = p_profile_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'That person is not a member of this company' USING ERRCODE = '22023';
  END IF;

  -- Removing someone ELSE requires owner/admin. Self-removal ("leave
  -- company") is always allowed for any role — but never for the last
  -- owner, or the company would be orphaned.
  IF p_profile_id IS DISTINCT FROM v_caller THEN
    v_caller_role := public.my_company_role(p_company_id);
    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Only owners and admins can remove members' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Last-owner guard applies to every removal path.
  IF v_target_role = 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM public.company_members m
    WHERE m.company_id = p_company_id AND m.member_role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of this company' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.company_members m
  WHERE m.company_id = p_company_id AND m.profile_id = p_profile_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.remove_company_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_company_member(uuid, uuid) TO authenticated;

-- ============================================================================
-- 4. company_members_list — roster read for any member of the company
-- ============================================================================

CREATE OR REPLACE FUNCTION public.company_members_list(p_company_id uuid)
RETURNS TABLE (
  profile_id uuid,
  full_name text,
  email text,
  member_role text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  -- Caller must hold ANY membership row in the company (staff included) —
  -- owns_company() resolves through company_members and returns true for
  -- every role. Non-members get an empty set rather than an error so the
  -- function doesn't become a membership oracle... except RLS already hides
  -- company_members rows from non-members, and an empty roster is the honest
  -- answer either way.
  SELECT m.profile_id, p.full_name, p.email, m.member_role, m.created_at
  FROM public.company_members m
  JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.company_id = p_company_id
    AND public.owns_company(p_company_id)
  ORDER BY m.created_at
$$;

REVOKE EXECUTE ON FUNCTION public.company_members_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_members_list(uuid) TO authenticated;
