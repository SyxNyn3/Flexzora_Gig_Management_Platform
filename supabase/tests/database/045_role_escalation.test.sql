-- Regression: issue #45 — role self-assignment / company takeover.
-- Runs under `supabase test db` (pgTAP). Simulates the API role by switching
-- to `authenticated` with a request.jwt.claims sub, exactly as PostgREST does.
BEGIN;
SELECT plan(9);

-- fixtures: two auth users, created the way GoTrue does (fires handle_new_user)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'attacker@test.local', 'x', '{"full_name":"Attacker","role":"admin"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'victim@test.local', 'x', '{"full_name":"Victim","role":"company"}'::jsonb, now(), now());

-- Path A: metadata role='admin' must land as 'worker'
SELECT is(
  (SELECT role::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a001'),
  'worker', '#45A signup with role=admin metadata is coerced to worker');

-- the legitimate self-service role still works
SELECT is(
  (SELECT role::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a002'),
  'company', 'signup with role=company metadata is honoured');

-- victim owns a company
INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c001', 'VictimCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a002';

-- become the attacker through the API role
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true);

-- Path B: direct role flip is rejected
SELECT throws_ok(
  $$ UPDATE profiles SET role = 'admin' WHERE user_id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', NULL, '#45B UPDATE profiles.role → admin is rejected');

SELECT throws_ok(
  $$ UPDATE profiles SET role = 'company' WHERE user_id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', NULL, '#45B UPDATE profiles.role → company is rejected');

-- ordinary profile edits still work
SELECT lives_ok(
  $$ UPDATE profiles SET bio = 'hello' WHERE user_id = '00000000-0000-0000-0000-00000000a001' $$,
  'non-privileged profile columns remain editable');

-- cannot self-insert an admin profile either
SELECT throws_ok(
  $$ INSERT INTO profiles (user_id, email, full_name, role)
     VALUES ('00000000-0000-0000-0000-00000000a001', 'x@test.local', 'X', 'admin') $$,
  '42501', NULL, '#45 self-insert of admin profile is rejected by RLS');

-- takeover chain: UPDATE companies.created_by on a company you don't own.
-- RLS filters the row out (0 rows), so no error — assert the row is untouched.
UPDATE companies SET created_by = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a001')
 WHERE id = '00000000-0000-0000-0000-00000000c001';
RESET ROLE;
SELECT is(
  (SELECT p.user_id FROM companies c JOIN profiles p ON p.id = c.created_by WHERE c.id = '00000000-0000-0000-0000-00000000c001'),
  '00000000-0000-0000-0000-00000000a002'::uuid,
  '#45 non-owner cannot repoint companies.created_by');

-- even the OWNER cannot transfer ownership through the API
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE companies SET created_by = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a001')
      WHERE id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', NULL, '#45 owner cannot transfer created_by via API');

-- owner can still edit their own company
SELECT lives_ok(
  $$ UPDATE companies SET description = 'ok' WHERE id = '00000000-0000-0000-0000-00000000c001' $$,
  'owner edits to own company still work');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
