/*
  # Tighten function EXECUTE privileges

  Postgres grants EXECUTE to PUBLIC on new functions; Supabase adds anon/
  authenticated defaults. Any SECURITY DEFINER function missing an internal
  auth guard was therefore anonymously callable. Grant the two real callers
  explicitly, then strip PUBLIC+anon.

  Public whitelist kept (anon needs these pre-auth):
  waitlist_fill_crew_card, waitlist_referral_status, waitlist_public_stats,
  get_public_profile.

  Self-defending DO block — enumerates functions that exist on the replaying
  database, so it's safe regardless of migration ordering. Extension-owned
  functions excluded via pg_depend. Applied to remote 2026-10-16.
*/
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON d.refobjid = e.oid
        WHERE d.objid = p.oid
      )
      AND p.proname NOT IN (
        'waitlist_fill_crew_card',
        'waitlist_referral_status',
        'waitlist_public_stats',
        'get_public_profile'
      )
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      f.proname, f.args
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      f.proname, f.args
    );
  END LOOP;
END;
$$;

-- Trigger handlers are invoked BY triggers, never called directly — no
-- API role should hold EXECUTE on them at all. (PostgREST can't call
-- trigger-returning functions regardless; this removes the privilege.)
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON d.refobjid = e.oid
        WHERE d.objid = p.oid
      )
      AND p.proname NOT IN ('checkauthtrigger', 'postgis_cache_bbox')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      f.proname, f.args
    );
  END LOOP;
END;
$$;
