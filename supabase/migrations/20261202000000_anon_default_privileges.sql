-- Close the anon default-privilege leak.
--
-- 20261018010000_revoke_anon_table_privileges was a one-time REVOKE: it
-- stripped anon's table grants that existed at that moment, but Supabase's
-- default privileges (pg_default_acl, owner postgres, schema public) kept
-- granting anon full table+sequence privileges on every table created
-- afterwards. outbound_messages (created 2026-10-29) is the proof — it
-- shipped with anon SELECT/INSERT/UPDATE/DELETE despite RLS, leaving RLS as
-- the only wall on a table the unauthenticated frontend never touches.
--
-- Two-part fix:
--   1. ALTER DEFAULT PRIVILEGES stops future postgres-owned public tables
--      and sequences from granting anything to anon. authenticated and
--      service_role keep their defaults — the app relies on them and RLS
--      remains the row-level boundary.
--   2. Explicit REVOKE cleans the one user table that already leaked.
--
-- Unaffected: supabase_admin-owned default ACLs (engine objects) and the
-- PostGIS system tables, which are owner-locked and tracked separately.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

REVOKE ALL ON public.outbound_messages FROM anon;
