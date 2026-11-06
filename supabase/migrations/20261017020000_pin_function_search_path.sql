/*
  # Pin search_path on all user functions (security lint 0011)

  Role-mutable search_path lets a caller shadow object names via pg_temp —
  pinning to 'public, pg_temp' closes that without changing resolution.

  Written as a self-defending DO block: it enumerates user functions that
  exist on the database replaying it, so it applies cleanly regardless of
  migration ordering or missing objects. Extension-owned functions are
  excluded via pg_depend (PostGIS/vector members must not be touched).

  Applied to remote 2026-10-16 (51 functions pinned).
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
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      f.proname, f.args
    );
  END LOOP;
END;
$$;
