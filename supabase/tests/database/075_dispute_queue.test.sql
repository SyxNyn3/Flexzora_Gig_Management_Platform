-- Lane B #8: dispute mediation queue. Either party opens; the company
-- resolves (as submitted / adjust clock record / void); dispute fields are
-- system-managed and the other side is always notified.
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dq-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dq-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b073', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dq-outsider@test.local', 'x', '{"full_name":"Outsider","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0dc', 'DisputeCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b071';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d021', '00000000-0000-0000-0000-00000000c0dc', 'Hall', '1 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0d1', '00000000-0000-0000-0000-00000000c0dc', '00000000-0000-0000-0000-00000000d021',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b071'), 'Gala', current_date - 2, current_date - 2, 'completed');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000e0d1', 'Deck', 'Stagehand', 1,
   now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 40.00, 'completed');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000f501', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072';

-- three submitted timesheets on the same booking's siblings
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f502', '00000000-0000-0000-0000-00000000e0d1', 'Deck 2', 'Stagehand', 1,
   now() - interval '1 days', now() - interval '1 days' + interval '8 hours', 40.00, 'completed'),
  ('00000000-0000-0000-0000-00000000f503', '00000000-0000-0000-0000-00000000e0d1', 'Deck 3', 'Stagehand', 1,
   now() - interval '12 hours', now() - interval '4 hours', 40.00, 'completed');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000f502', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-00000000f503', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072';

INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, status)
SELECT '00000000-0000-0000-0000-00000000d501', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000f501', id,
       now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000d502', '00000000-0000-0000-0000-00000000a502', '00000000-0000-0000-0000-00000000f502', id,
       now() - interval '1 days', now() - interval '1 days' + interval '8 hours', 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000d503', '00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-00000000f503', id,
       now() - interval '12 hours', now() - interval '4 hours', 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072';

-- 1: worker opens a dispute on d501
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT ok(open_timesheet_dispute('00000000-0000-0000-0000-00000000d501', 'Clock-out recorded early'), 'worker can open a dispute on their submitted timesheet');

SELECT results_eq(
  $$ SELECT status::text, resolution IS NULL FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d501' $$,
  $$ VALUES ('disputed', true) $$,
  'dispute stamps status + clears any prior resolution');

-- 2: outsiders can't open
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b073","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT open_timesheet_dispute('00000000-0000-0000-0000-00000000d502', 'not mine') $$,
  'non-party cannot open a dispute');

-- 3: workers can't write dispute fields directly (system-managed) — d502 is
-- still 'submitted' so RLS passes the row through to the guard
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE timesheets SET resolution = 'as_submitted' WHERE id = '00000000-0000-0000-0000-00000000d502' $$,
  'worker cannot self-resolve via direct update');

-- 4: owner resolves d501 as submitted; company notified on open, worker on resolve
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b071","role":"authenticated"}', true);
SELECT ok(resolve_timesheet_dispute('00000000-0000-0000-0000-00000000d501', 'as_submitted', NULL, NULL, 'Clock record stands'), 'owner resolves as submitted');

SELECT results_eq(
  $$ SELECT status::text, resolution, resolved_by IS NOT NULL FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d501' $$,
  $$ VALUES ('submitted', 'as_submitted', true) $$,
  'as_submitted returns the sheet to the approval queue with audit fields stamped');

SELECT ok(EXISTS(
  SELECT 1 FROM notifications n JOIN profiles p ON p.id = n.user_id
  WHERE p.user_id = '00000000-0000-0000-0000-00000000b072' AND n.title = 'Timesheet dispute resolved'),
  'worker is notified of the resolution');

-- 5: adjusted resolution corrects the clock record on d502
SELECT ok(resolve_timesheet_dispute(
  '00000000-0000-0000-0000-00000000d502', 'adjusted',
  now() - interval '1 days', now() - interval '1 days' + interval '9 hours',
  'Stayed late for strike'), 'owner can adjust the clock record');

SELECT results_eq(
  $$ SELECT status::text, resolution, clock_out_at = now() - interval '1 days' + interval '9 hours' FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d502' $$,
  $$ VALUES ('submitted', 'adjusted', true) $$,
  'adjusted writes corrected times and requeues the sheet');

-- 6: voided on d503 ends the dispute with no pay
SELECT ok(resolve_timesheet_dispute('00000000-0000-0000-0000-00000000d503', 'voided', NULL, NULL, 'Duplicate sheet'), 'owner can void a disputed sheet');

SELECT * FROM finish();
ROLLBACK;
