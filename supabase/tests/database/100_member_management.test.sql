-- Regression: member management RPCs — add/update/remove/list company_members.
-- Runs under `supabase test db` (pgTAP). Simulates the API role by switching
-- to `authenticated` with a request.jwt.claims sub, exactly as PostgREST does.
BEGIN;
SELECT plan(13);

-- fixtures: owner + member-to-be + staff-to-be + unrelated bystander
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mm-owner@test.local', 'x', '{"full_name":"MM Owner","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mm-admin@test.local', 'x', '{"full_name":"MM Admin","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mm-staff@test.local', 'x', '{"full_name":"MM Staff","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mm-bystander@test.local', 'x', '{"full_name":"MM Bystander","role":"worker"}'::jsonb, now(), now());

-- company fixture as superuser; the seed trigger writes the owner membership
INSERT INTO companies (name, created_by)
SELECT 'Member Mgmt Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009a01';

-- helper aliases for readability in the assertions below
CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009a01') AS owner_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009a02') AS admin_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-000000009a03') AS staff_pid,
  (SELECT id FROM companies WHERE name = 'Member Mgmt Co') AS company_id;

-- Temp tables are owned by the creating role; after SET LOCAL ROLE
-- authenticated the assertions below still need to read fixture ids.
GRANT SELECT ON ids TO authenticated;

-- become the owner through the API role
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009a01","role":"authenticated"}', true);

SELECT ok(
  public.owns_company((SELECT company_id FROM ids)),
  'owner owns the company via membership');

-- owner adds two members by email
SELECT lives_ok(
  $$ SELECT public.add_company_member((SELECT company_id FROM ids), 'mm-admin@test.local', 'admin') $$,
  'owner can add an existing account as admin');
SELECT lives_ok(
  $$ SELECT public.add_company_member((SELECT company_id FROM ids), 'mm-staff@test.local') $$,
  'owner can add an existing account as staff (default role)');

-- duplicate add is an explicit error, not a silent no-op
SELECT throws_ok(
  $$ SELECT public.add_company_member((SELECT company_id FROM ids), 'mm-admin@test.local') $$,
  '22023', NULL, 'adding an existing member raises a clear error');

-- roster is readable by the owner
SELECT is(
  (SELECT count(*)::int FROM public.company_members_list((SELECT company_id FROM ids))),
  3, 'company_members_list returns all 3 members');

-- last-owner guard: owner cannot demote themselves while sole owner
SELECT throws_ok(
  $$ SELECT public.update_company_member_role((SELECT company_id FROM ids), (SELECT owner_pid FROM ids), 'admin') $$,
  '42501', NULL, 'cannot demote the last owner');

RESET ROLE;

-- become the staff member
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009a03","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.company_members_list((SELECT company_id FROM ids))),
  3, 'staff member can read the roster');
SELECT throws_ok(
  $$ SELECT public.add_company_member((SELECT company_id FROM ids), 'mm-bystander@test.local') $$,
  '42501', NULL, 'staff cannot add members');
SELECT throws_ok(
  $$ SELECT public.update_company_member_role((SELECT company_id FROM ids), (SELECT admin_pid FROM ids), 'staff') $$,
  '42501', NULL, 'staff cannot change roles');
SELECT throws_ok(
  $$ SELECT public.remove_company_member((SELECT company_id FROM ids), (SELECT admin_pid FROM ids)) $$,
  '42501', NULL, 'staff cannot remove other members');

-- self-removal ("leave company") is allowed for any role
SELECT lives_ok(
  $$ SELECT public.remove_company_member((SELECT company_id FROM ids), (SELECT staff_pid FROM ids)) $$,
  'staff member can remove themselves');

RESET ROLE;

-- back as owner: remove the admin member; roster drops to 1
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009a01","role":"authenticated"}', true);
SELECT lives_ok(
  $$ SELECT public.remove_company_member((SELECT company_id FROM ids), (SELECT admin_pid FROM ids)) $$,
  'owner can remove an admin member');

RESET ROLE;

-- bystander: not a member → empty roster, cannot touch anything
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009a04","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.company_members_list((SELECT company_id FROM ids))),
  0, 'non-member sees an empty roster');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
