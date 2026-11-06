# Default privileges silently re-grant revoked access — HIGH

Found: 2026-11-06, live audit after `20261018010000_revoke_anon_table_privileges`
appeared to hold. Fixed by `20261202000000_anon_default_privileges.sql`.

## What happened

The October migration ran a one-time `REVOKE ALL ON ALL TABLES IN SCHEMA public
FROM anon` (paraphrased — it revoked existing grants). It worked: every table
that existed at that moment lost anon access. But Supabase sets **default
privileges** (`pg_default_acl`) that grant `anon`, `authenticated`, and
`service_role` full DML on every new table `postgres` creates in `public`.
Eleven days later `outbound_messages` was created — and shipped with
`anon=arwdDxtm` intact, RLS as the only wall on a table the unauthenticated
frontend never touches.

A point-in-time REVOKE is not a policy. It is a snapshot fix for a continuous
grants pipeline.

## Why it's dangerous

Every future table re-inherits the leak automatically. Nobody writes "grant
anon full DML" — the default ACL does it invisibly at `CREATE TABLE` time.
RLS still gates rows, so the blast radius is "defense-in-depth removed," but
the project's own doctrine is RLS as second wall, not only wall.

## Detection

```sql
-- Which roles does postgres auto-grant on future public tables?
select defaclobjtype, defaclacl::text
from pg_default_acl
where defaclrole = 'postgres'::regrole
  and defaclnamespace = 'public'::regnamespace;

-- Which existing tables still grant anon anything?
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';
```

## Fix

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
REVOKE ALL ON public.outbound_messages FROM anon;  -- the leaked table
```

Keep `authenticated` and `service_role` defaults — the app relies on them and
RLS remains the row boundary. `supabase_admin`-owned default ACLs (engine
objects: graphql, realtime schemas) are platform-owned and untouchable — same
boundary as `spatial_ref_sys`, needs a support ticket if ever flagged.

## Rule going forward

When hardening grants on Supabase, always check `pg_default_acl` for the
creating role, not just current grants. "Revoke now" without "revoke by
default" guarantees the finding comes back on the next migration.
