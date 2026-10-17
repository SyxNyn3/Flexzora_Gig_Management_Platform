/*
  # Revoke anonymous table privileges — defense in depth

  Supabase's default privileges grant anon SELECT/INSERT/UPDATE/DELETE/
  TRUNCATE on every public table, leaving RLS as the single boundary.
  The unauthenticated frontend makes zero direct table calls — landing
  stats, public profiles, and waitlist signup all route through
  whitelisted RPCs or the edge function (service role). Revoking anon
  table privileges makes RLS the second wall, not the only one.

  Whitelisted anon entry points after this migration:
    - POST /functions/v1/submit-waitlist        (edge function, service)
    - rpc/waitlist_fill_crew_card               (SECURITY DEFINER)
    - rpc/waitlist_referral_status              (SECURITY DEFINER)
    - rpc/waitlist_public_stats                 (SECURITY DEFINER)
    - rpc/get_public_profile                    (SECURITY DEFINER)

  PostGIS system tables are excluded — engine internals.
*/
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('spatial_ref_sys', 'geometry_columns', 'geography_columns')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.tablename);
  END LOOP;
END;
$$;
