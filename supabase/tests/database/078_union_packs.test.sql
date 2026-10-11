-- Lane B: union/local rule packs. approve_timesheet applies meal penalties
-- (stretch past the trigger without a real break → +1h straight) and the
-- turnaround floor (rest under N hours → early hours bill at double).
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'up-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'up-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0fc', 'UnionCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d041', '00000000-0000-0000-0000-00000000c0fc', 'Hall', '1 Main', 37.8, -122.4);

-- event on the Local 16 pack: meal trigger 5h, turnaround floor 9h, daily OT 8 / DT 12
INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status, overtime_rule_code) VALUES
  ('00000000-0000-0000-0000-00000000e0f1', '00000000-0000-0000-0000-00000000c0fc', '00000000-0000-0000-0000-00000000d041',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a1'), 'Show week', current_date - 3, current_date - 2, 'completed', 'IATSE_LOCAL_16');

-- night call ends 06:00; morning call clocks in 10:00 → 4h rest under the 9h floor
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f701', '00000000-0000-0000-0000-00000000e0f1', 'Night strike', 'Stagehand', 1,
   now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 40, 'completed'),
  ('00000000-0000-0000-0000-00000000f702', '00000000-0000-0000-0000-00000000e0f1', 'Morning reset', 'Stagehand', 1,
   now() - interval '1 day' + interval '4 hours', now() - interval '1 day' + interval '12 hours', 40, 'open');

-- shift ending 06:00 the same morning the f702 call clocks in at 10:00 → 4h gap
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f703', '00000000-0000-0000-0000-00000000e0f1', 'Late rig', 'Stagehand', 1,
   now() - interval '1 day' - interval '2 hours', now() - interval '1 day' + interval '4 hours', 40, 'completed');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a701', '00000000-0000-0000-0000-00000000f701', id, 'direct_book', 'confirmed', now() FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a2'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000a702', '00000000-0000-0000-0000-00000000f702', id, 'direct_book', 'confirmed', now() FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a2'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000a703', '00000000-0000-0000-0000-00000000f703', id, 'direct_book', 'confirmed', now() FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a2';

-- t1: 9h stretch, no break → meal penalty; t2: turnaround shortfall; t3: 9h with a 45min break → clean
INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, break_minutes, status)
SELECT '00000000-0000-0000-0000-00000000d701', '00000000-0000-0000-0000-00000000a701', '00000000-0000-0000-0000-00000000f701', id,
       now() - interval '2 days', now() - interval '2 days' + interval '9 hours', 0, 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a2'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000d702', '00000000-0000-0000-0000-00000000a702', '00000000-0000-0000-0000-00000000f702', id,
       now() - interval '1 day' + interval '10 hours', now() - interval '1 day' + interval '18 hours', 30, 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a2'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000d703', '00000000-0000-0000-0000-00000000a703', '00000000-0000-0000-0000-00000000f703', id,
       now() - interval '1 day' - interval '2 hours', now() - interval '1 day' + interval '7 hours', 45, 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0a2';

-- funded escrow covers all three approvals
INSERT INTO escrow_deposits (event_id, amount, status)
VALUES ('00000000-0000-0000-0000-00000000e0f1', 3000, 'funded');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0a1","role":"authenticated"}', true);

-- 1: t1 (9h, no break) → meal penalty 1h, 8 reg + 1 OT, gross = 320+60+40 = 420
SELECT ok(approve_timesheet('00000000-0000-0000-0000-00000000d701') IS NOT NULL, 'first approval succeeds');
SELECT results_eq(
  $$ SELECT regular_hours, overtime_hours, meal_penalty_hours, gross_pay FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d701' $$,
  $$ VALUES (8::numeric, 1::numeric, 1::numeric, 420::numeric) $$,
  '9h stretch with no meal break adds a straight-time penalty hour');

-- 2: t2 clocked in 6h after f703 ended (9h floor) → 3h shortfall → reg→dt.
--    worked 8h − 30min break = 7.5h: reg 7.5 → 4.5 reg + 3 dt;
--    the 30min break counts as a real meal → no penalty. gross = 180 + 240 = 420
SELECT ok(approve_timesheet('00000000-0000-0000-0000-00000000d702') IS NOT NULL, 'second approval succeeds');
SELECT results_eq(
  $$ SELECT regular_hours, doubletime_hours, turnaround_penalty_hours, gross_pay FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d702' $$,
  $$ VALUES (4.5::numeric, 3::numeric, 3::numeric, 420::numeric) $$,
  'hours inside the turnaround floor bill at double time');

-- 3: t3 took a real 45min meal break → no penalty even at 9h
SELECT ok(approve_timesheet('00000000-0000-0000-0000-00000000d703') IS NOT NULL, 'third approval succeeds');
SELECT is(
  (SELECT meal_penalty_hours FROM timesheets WHERE id = '00000000-0000-0000-0000-00000000d703'),
  0::numeric, 'a real meal break clears the penalty');

SELECT * FROM finish();
ROLLBACK;
