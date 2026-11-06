-- Regression: dual-role company membership — a worker-profile account creates
-- and operates a company via company_members, without mutating profiles.role.
-- Runs under `supabase test db` (pgTAP). Simulates the API role by switching
-- to `authenticated` with a request.jwt.claims sub, exactly as PostgREST does.
BEGIN;
SELECT plan(12);

-- fixtures: two auth users — one plain worker, one unrelated worker
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000009901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dualworker@test.local', 'x', '{"full_name":"Dual Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bystander@test.local', 'x', '{"full_name":"Bystander","role":"worker"}'::jsonb, now(), now());

-- profiles.role is never mutated by company creation — assert the worker role
-- landed and stays 'worker' after everything below.
SELECT is(
  (SELECT role::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009901'),
  'worker', 'signup role=worker honoured');

-- become the dual-role worker through the API role
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009901","role":"authenticated"}', true);

-- before creating anything: no memberships, owns nothing
SELECT is((SELECT count(*)::int FROM my_company_memberships()), 0, 'worker starts with zero memberships');

-- the ONLY creation path: create_company RPC writes company + owner member atomically
SELECT lives_ok(
  $$ SELECT * FROM public.create_company('Dual Role Test Co', 'dual@test.local') $$,
  'worker can create a company via create_company RPC');

SELECT is(
  (SELECT member_role FROM company_members cm
    JOIN companies c ON c.id = cm.company_id
    WHERE c.name = 'Dual Role Test Co'
      AND cm.profile_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009901')),
  'owner', 'creator is written as owner member');

SELECT ok(
  public.owns_company((SELECT id FROM companies WHERE name = 'Dual Role Test Co')),
  'owns_company() is true for the new company via membership');

SELECT is((SELECT count(*)::int FROM my_company_memberships()), 1, 'my_company_memberships returns the new company');

-- direct INSERT on companies is closed to authenticated roles
SELECT throws_ok(
  $$ INSERT INTO companies (name, created_by)
     SELECT 'Direct Insert Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009901' $$,
  '42501', NULL, 'direct companies INSERT is rejected by RLS (RPC only)');

-- owner can update their company row but cannot move created_by
SELECT lives_ok(
  $$ UPDATE companies SET description = 'dual-role works' WHERE name = 'Dual Role Test Co' $$,
  'owner member can update the company');
SELECT throws_ok(
  $$ UPDATE companies SET created_by = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009902')
     WHERE name = 'Dual Role Test Co' $$,
  '42501', NULL, 'created_by still immutable through the API');

RESET ROLE;

-- bystander: no membership → owns_company false, memberships empty
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009902","role":"authenticated"}', true);
SELECT ok(
  NOT public.owns_company((SELECT id FROM companies WHERE name = 'Dual Role Test Co')),
  'unrelated user does not own the company');
SELECT is((SELECT count(*)::int FROM my_company_memberships()), 0, 'bystander sees zero memberships');

RESET ROLE;
-- role never mutated: still 'worker' after creating + operating a company
SELECT is(
  (SELECT role::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009901'),
  'worker', 'profiles.role stays worker after company creation');

SELECT * FROM finish();
ROLLBACK;
