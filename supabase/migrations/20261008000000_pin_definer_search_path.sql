-- Pin search_path on every SECURITY DEFINER function in public that lacks it.
--
-- PostgreSQL implicitly searches pg_temp first in a session's search_path.
-- SECURITY DEFINER functions without a pinned search_path therefore resolve
-- unqualified table/function references through any temp objects the CALLING
-- user created in their own session. A malicious authenticated user could
-- CREATE TEMP TABLE companies/profiles/... and then trigger these functions
-- (owns_company, worker_can_see_shift, approve_timesheet, mark_escrow_funded,
-- validate_clock_event, ...) so they read attacker-controlled rows — bypassing
-- the RLS ownership helpers that guard the marketplace schema.
--
-- Rather than enumerate signatures by hand (and miss one on the next
-- migration), this sweeps pg_proc for every definer function in public whose
-- proconfig does not already pin search_path and ALTERs it in place. Bodies
-- are untouched; idempotent and safe to replay.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND (p.proconfig IS NULL
            OR NOT EXISTS (
                 SELECT 1 FROM unnest(p.proconfig) AS cfg
                  WHERE cfg LIKE 'search_path=%'))
  LOOP
    -- public + extensions covers both layouts for PostGIS/Supabase-managed
    -- extensions; schemas that don't exist are silently ignored.
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_catalog',
      fn.proname, fn.identity_args
    );
  END LOOP;
END $$;
