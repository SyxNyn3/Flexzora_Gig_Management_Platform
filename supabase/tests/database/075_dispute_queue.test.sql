-- Lane B #8: dispute mediation queue. Either party opens; the company
-- resolves (as submitted / adjust clock record / void); dispute fields are
-- system-managed and the other side is always notified.
BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b071'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'dq-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b072'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'dq-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b073'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'dq-outsider@test.local', 'x', '{"full_name":"Outsider","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0dc'::uuid, 'DisputeCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b071'::uuid;

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d021'::uuid, '00000000-0000-0000-0000-00000000c0dc'::uuid, 'Hall', '1 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0d1'::uuid, '00000000-0000-0000-0000-00000000c0dc'::uuid, '00000000-0000-0000-0000-00000000d021'::uuid,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b071'::uuid), 'Gala', current_date - 2, current_date - 2, 'completed');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f501'::uuid, '00000000-0000-0000-0000-00000000e0d1'::uuid, 'Deck', 'Stagehand', 1,
   now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 40.00, 'completed');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a501'::uuid, '00000000-0000-0000-0000-00000000f501'::uuid, id, 'direct_book'::assignment_source, 'confirmed'::assignment_status, now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'::uuid;

-- three submitted timesheets on the same booking's siblings
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f502'::uuid, '00000000-0000-0000-0000-00000000e0d1'::uuid, 'Deck 2', 'Stagehand', 1,
   now() - interval '1 days', now() - interval '1 days' + interval '8 hours', 40.00, 'completed'),
  ('00000000-0000-0000-0000-00000000f503'::uuid, '00000000-0000-0000-0000-00000000e0d1'::uuid, 'Deck 3', 'Stagehand', 1,
   now() - interval '12 hours', now() - interval '4 hours', 40.00, 'completed');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a502'::uuid, '00000000-0000-0000-0000-00000000f502'::uuid, id, 'direct_book'::assignment_source, 'confirmed'::assignment_status, now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-00000000a503'::uuid, '00000000-0000-0000-0000-00000000f503'::uuid, id, 'direct_book'::assignment_source, 'confirmed'::assignment_status, now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'::uuid;

INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, status)
SELECT '00000000-0000-0000-0000-00000000d501'::uuid, '00000000-0000-0000-0000-00000000a501'::uuid, '00000000-0000-0000-0000-00000000f501'::uuid, id,
       now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 'submitted'::timesheet_status
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-00000000d502'::uuid, '00000000-0000-0000-0000-00000000a502'::uuid, '00000000-0000-0000-0000-00000000f502'::uuid, id,
       now() - interval '1 days', now() - interval '1 days' + interval '8 hours', 'submitted'::timesheet_status
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-00000000d503'::uuid, '00000000-0000-0000-0000-00000000a503'::uuid, '00000000-0000-0000-0000-00000000f503'::uuid, id,
       now() - interval '12 hours', now() - interval '4 hours', 'submitted'::timesheet_status
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b072'::uuid;

-- 1: worker opens a dispute on d501
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT ok(open_timesheet_dispute('00000000-0000-0000-0000-00000000d501'::uuid, 'Clock-out recorded early'), 'worker can open a dispute on their submitted timesheet');

SELECT results_eq(
  $$ SELECT status::text, resolution IS NULL FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d501'::uuid $$,
  $$ VALUES ('disputed', true) $$,
  'dispute stamps status + clears any prior resolution');

-- 2: outsiders can't open
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b073","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT open_timesheet_dispute('00000000-0000-0000-0000-00000000d502'::uuid, 'not mine') $$,
  'P0001', 'Not a party', 'non-party cannot open a dispute');

-- 3: workers can't write dispute fields directly (system-managed) — d502 is
-- still 'submitted' so RLS passes the row through to the guard
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE timesheets SET resolution = 'as_submitted' WHERE id = '00000000-0000-0000-0000-00000000d502'::uuid $$,
  'P0001', 'system-managed', 'worker cannot self-resolve via direct update');

-- 4: owner resolves d501 as submitted; company notified on open, worker on resolve
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b071","role":"authenticated"}', true);
SELECT ok(resolve_timesheet_dispute('00000000-0000-0000-0000-00000000d501'::uuid, 'as_submitted', NULL, NULL, 'Clock record stands'), 'owner resolves as submitted');

SELECT results_eq(
  $$ SELECT status::text, resolution, resolved_by IS NOT NULL FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d501'::uuid $$,
  $$ VALUES ('submitted', 'as_submitted', true) $$,
  'as_submitted returns the sheet to the approval queue with audit fields stamped');

RESET ROLE;
SELECT ok(EXISTS(
  SELECT 1 FROM notifications n JOIN profiles p ON p.id = n.user_id
  WHERE p.user_id = '00000000-0000-0000-0000-00000000b072'::uuid AND n.title = 'Timesheet dispute resolved'),
  'worker is notified of the resolution');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b071","role":"authenticated"}', true);

-- 5: adjusted resolution corrects the clock record on d502
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT ok(open_timesheet_dispute('00000000-0000-0000-0000-00000000d502', 'Stayed late for strike'), 'worker opens dispute on d502');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b071","role":"authenticated"}', true);
SELECT ok(resolve_timesheet_dispute(
  '00000000-0000-0000-0000-00000000d502'::uuid, 'adjusted',
  now() - interval '1 days', now() - interval '1 days' + interval '9 hours',
  'Stayed late for strike'), 'owner can adjust the clock record');

SELECT results_eq(
  $$ SELECT status::text, resolution, clock_out_at = now() - interval '1 days' + interval '9 hours' FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d502'::uuid $$,
  $$ VALUES ('submitted', 'adjusted', true) $$,
  'adjusted writes corrected times and requeues the sheet');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT ok(open_timesheet_dispute('00000000-0000-0000-0000-00000000d503'::uuid, 'Duplicate sheet'), 'worker opens dispute on d503');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b071","role":"authenticated"}', true);
-- 6: voided on d503 ends the dispute with no pay
SELECT ok(resolve_timesheet_dispute('00000000-0000-0000-0000-00000000d503'::uuid, 'voided', NULL, NULL, 'Duplicate sheet'), 'owner can void a disputed sheet');

-- 7: an approved sheet cannot be disputed back into the approval queue —
-- resolve→approve would mint a second invoice and payout for the same work
RESET ROLE;
UPDATE timesheets SET status = 'approved' WHERE id = '00000000-0000-0000-0000-00000000d502';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b072","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT open_timesheet_dispute('00000000-0000-0000-0000-00000000d502', 'double pay attempt') $$,
  'P0001', NULL, 'disputing an approved timesheet is refused');

SELECT * FROM finish();
ROLLBACK;
