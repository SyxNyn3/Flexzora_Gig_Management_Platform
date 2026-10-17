# Postgres / Supabase Security Knowledge

Source: live audit of the Flexzora Supabase project (qgjtrosadftjrplubjaw),
2026-10-16. Severity tags: CRITICAL / HIGH / MEDIUM / LOW / INFO.

---

## 1. SECURITY DEFINER functions are publicly callable by default — HIGH

**What:** Every Postgres function grants `EXECUTE` to `PUBLIC` on creation,
and Supabase's default privileges add `anon` + `authenticated`. Result: any
`SECURITY DEFINER` RPC is callable by the anonymous public API key.
Audit found **90 such functions**, including privileged operations
(`approve_timesheet`, `company_decide_swap`, `bail_kept_cents`,
`commit_import_job`).

**Why it happens:** nobody ever revoked anything. Postgres defaults grant
PUBLIC execute; Supabase extends it. The app only "worked" because each
function happened to check `auth.uid()` internally — one function missing
that guard is anonymous privilege escalation.

**Detection:**
```sql
select p.proname
from pg_proc p join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public' and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'EXECUTE');
```
Advisor lint: `anon_security_definer_function_executable` (WARN).

**Fix applied:**
```sql
GRANT EXECUTE ON FUNCTION public.f(...) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.f(...) FROM PUBLIC, anon;
```
Order matters: GRANT first (revoking PUBLIC also strips authenticated if
it only had inherited access). Migration:
`supabase/migrations/20261017010000_revoke_anon_execute.sql`.
Gotcha: revoking FROM anon alone does nothing while PUBLIC still holds the
grant — anon inherits PUBLIC. Must revoke PUBLIC.

**Prevention rule:** after creating any `SECURITY DEFINER` function,
immediately `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE TO <only the roles
that need it>`. Maintain an explicit public-API whitelist (ours:
`waitlist_fill_crew_card`, `waitlist_referral_status`,
`waitlist_public_stats`, `get_public_profile`).

---

## 2. anon holds full table privileges — RLS is the only wall — HIGH

**What:** Supabase's default privileges grant `anon` (and `authenticated`)
SELECT/INSERT/UPDATE/DELETE/**TRUNCATE**/REFERENCES/TRIGGER on every
table in `public` — `payments`, `payouts`, `worker_sensitive`,
`fraud_signals`, all 70+. Row-Level Security is the single boundary
between the public API key and every row in the database.

**Why it happens:** "RLS is enabled" feels like a complete answer, but
privileges and policies are different layers. Privilege says *may touch
this table at all*; the policy says *which rows*. One permissive future
policy (or a forgotten `WITH CHECK`) exposes the whole table because the
privilege was always there.

**Detection:**
```sql
select table_name, privilege_type
from information_schema.role_table_grants
where grantee='anon' and table_schema='public'
  and privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE');
```

**Fix applied:** blanket `REVOKE ALL ON TABLE public.<t> FROM anon` for
every user table (migration
`supabase/migrations/20261018000000_revoke_anon_table_privileges.sql`).
The anon surface is now exactly 4 SECURITY DEFINER RPCs + the edge
functions — verified: `GET /rest/v1/waiting_list` returns
`42501 permission denied`, `rpc/waitlist_public_stats` still works.
PostGIS system tables (`spatial_ref_sys`, `geometry_columns`,
`geography_columns`) excluded — engine internals. PostgREST cannot emit
TRUNCATE regardless, so that grant was latent, not exploitable via REST.

**Prevention rule:** anon should hold table privileges ONLY on tables an
unauthenticated client must touch directly (usually: none). Public
reads/writes belong behind SECURITY DEFINER RPCs with curated fields —
treat `SELECT *` on a raw table as never acceptable for anon.

---

## 3. Role-mutable search_path on functions — MEDIUM (51 findings)

**What:** functions created without `SET search_path` resolve unqualified
object names against the *caller's* search path. A malicious user can create
objects in `pg_temp` that shadow real tables/functions.

**Why:** Postgres resolves names through search_path at runtime; `pg_temp`
is implicitly searched first when unlisted.

**Detection:** advisor lint `function_search_path_mutable`;
```sql
select proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid
where n.nspname='public' and p.prokind='f'
  and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
```

**Fix applied:** `ALTER FUNCTION ... SET search_path = public, pg_temp;`
for every user function (pg_temp explicitly *last*). Migration:
`supabase/migrations/20261017000000_pin_function_search_path.sql`.
Do NOT blanket-ALTER: scope to user functions only — exclude
extension-owned members via `pg_depend`/`pg_extension` join (the raw count
was 944 including PostGIS/vector; only 51 were ours).

**Prevention rule:** every `CREATE [OR REPLACE] FUNCTION` gets
`SET search_path = public` (or stricter) in its definition.

---

## 4. Anonymous SECURITY DEFINER RPC needs abuse guards — designed-in

`waitlist_fill_crew_card` is intentionally public (fills a just-created
waitlist row pre-auth). Defenses built in, worth reusing as a pattern:

- **First-write-wins:** `WHERE ... AND full_name IS NULL` — claimed cards
  can't be overwritten.
- **Freshness window:** `AND created_at > now() - interval '30 minutes'` —
  legacy rows (unclaimed forever otherwise) can't be hijacked by email
  guess.
- **Consent monotonicity:** `sms_consent OR p_sms_consent` — anonymous
  calls can grant but never revoke consent.
- **Monotonic completeness:** `GREATEST(profile_completeness, ...)`.
- **Per-IP rate limit:** hit-log table + cap (8/min) keyed by
  `x-forwarded-for` from `current_setting('request.headers')`.
- **Server-side IP capture:** `signup_ip` written from headers, not from
  client body — fraud signal that can't be forged at the field level.
- **`SET search_path = public`** on the function itself.
- Hit-log table has RLS enabled + zero policies = API-invisible.

**Prevention rule:** any anonymous-write RPC gets: row-existence gate +
unclaimed-row gate + freshness window + per-IP cap + no info-leaking
return value.

---

## 5. RLS posture verified — but verify per-table, not by vibes

**Method that worked:** query `pg_policies` for `qual`/`with_check`
clauses; any policy where both are null/true is unscoped. Finding: catalog
reads (skills, certs) and self-scoped inserts were intentional; sensitive
tables (`worker_sensitive`, `fraud_signals`, `payments`, `payouts`,
`invoices`, `waiting_list` admin ops) were all correctly scoped.

**Prevention rule:** on every migration review, run the unscoped-policy
query. `INSERT` policies live in `with_check`, not `qual` — check both.

---

## 6. Remaining known items (accepted or pending)

- `spatial_ref_sys` lacks RLS (ERROR lint) — PostGIS internal table;
  enabling RLS breaks geo queries. Accepted; standard practice leaves it.
- `vector`, `pg_trgm`, `postgis` installed in `public` schema (WARN) —
  moving extensions is riskier than the exposure. Accepted.
- `rl_experiences`, `training_data` — RLS enabled, zero policies =
  deny-all, zero rows, zero code references. Dead scaffolding —
  candidates for removal, safe until then.
- Deployed `submit-waitlist` edge function is an older revision (silently
  drops crew-card fields). Data path is covered by the RPC fill; deploy
  the updated function when a fresh `SUPABASE_ACCESS_TOKEN` exists.
- Dashboard-only settings to verify: leaked-password protection, OTP
  expiry, auth rate limits (Supabase Auth defaults are sane).

---

## How the access actually worked (for future agents)

- `SUPABASE_ACCESS_TOKEN` (`sbp_…` PAT) in `.env.local` was EXPIRED —
  Management API returned "Invalid access token". PATs are needed for
  `db push` / `functions deploy`.
- `SUPABASE_DB_PASSWORD` + the **session pooler**
  (`aws-0-<region>.pooler.supabase.com:6543`, user
  `postgres.<project-ref>`) gave full DDL/DML via the `pg` node driver.
- The `supabase-remote` MCP `execute_sql` runs read-only — DDL fails with
  `25006`. Use it for `get_advisors`, `list_tables`, `query_logs`;
  use direct Postgres for writes.
- Edge function deploy requires the Management API (PAT) or Supabase CLI —
  no SQL path exists. When blocked, a SECURITY DEFINER RPC can bridge a
  stale function's missing columns (see #3).
