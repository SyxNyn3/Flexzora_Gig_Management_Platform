-- Red-team batch 2: #106 delete guards, #107 term freeze, #108 send once,
-- #109 staff-link, #111 claim guard, #112 card dedupe, #113/#114 revokes,
-- #116 confirmed-price lock.
BEGIN;
SELECT plan(12);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000063a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hb-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000063a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hb-booked@test.local', 'x', '{"full_name":"Booked","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000063a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hb-runner@test.local', 'x', '{"full_name":"Runner","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000063f1', 'BatchCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000063d1', '00000000-0000-0000-0000-0000000063f1', 'Stage', '9 Pike', 47.6, -122.3);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000063e1', '00000000-0000-0000-0000-0000000063f1', '00000000-0000-0000-0000-0000000063d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a1'), 'Gig', current_date + 5, current_date + 5, 'published');

INSERT INTO event_budgets (event_id, budget_cap, platform_fee_pct) VALUES
  ('00000000-0000-0000-0000-0000000063e1', 10000, 12.00);

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage) VALUES
  ('00000000-0000-0000-0000-0000000063f2', '00000000-0000-0000-0000-0000000063e1', 'Spot', 'Spot Op', 4,
   now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 40, 'open', 'public'),
  -- an untouched call for the allowed-delete case
  ('00000000-0000-0000-0000-0000000063f3', '00000000-0000-0000-0000-0000000063e1', 'Idle', 'Idle Op', 1,
   now() + interval '6 days', now() + interval '6 days' + interval '8 hours', 40, 'open', 'public');

INSERT INTO shift_assignments (id, shift_id, worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2'), 'confirmed'),
  ('00000000-0000-0000-0000-0000000063c2', '00000000-0000-0000-0000-0000000063f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3'), 'confirmed');

SET LOCAL ROLE authenticated;

-- #106: deletes are blocked once commitments exist (owner claims)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a1","role":"authenticated"}', true);
SELECT throws_ok(
  $$ DELETE FROM shifts WHERE id = '00000000-0000-0000-0000-0000000063f2' $$,
  '42501', NULL, '#106 confirmed call cannot be deleted');
SELECT throws_ok(
  $$ DELETE FROM events WHERE id = '00000000-0000-0000-0000-0000000063e1' $$,
  '42501', NULL, '#106 event with bookings cannot be deleted');

-- #107: pay inputs freeze once crew is confirmed
SELECT throws_ok(
  $$ UPDATE events SET overtime_rule_code = 'US_CA' WHERE id = '00000000-0000-0000-0000-0000000063e1' $$,
  '42501', NULL, '#107 overtime rule locked after confirmation');
SELECT throws_ok(
  $$ UPDATE event_budgets SET platform_fee_pct = 25.00 WHERE event_id = '00000000-0000-0000-0000-0000000063e1' $$,
  '42501', NULL, '#107 platform fee locked after confirmation');

-- #109: staff profile link must match the staff row's own email
SELECT throws_ok(
  $$ INSERT INTO staff_members (company_id, full_name, email, profile_id)
     VALUES ('00000000-0000-0000-0000-0000000063f1', 'Fake Staff', 'someone-else@test.local',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2')) $$,
  '42501', NULL, '#109 link to a different account rejected');
SELECT lives_ok(
  $$ INSERT INTO staff_members (company_id, full_name, email, profile_id)
     VALUES ('00000000-0000-0000-0000-0000000063f1', 'Real Staff', 'hb-booked@test.local',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2')) $$,
  '#109 link allowed when the profile owns that email');

-- #112: one active auto_unfilled card per shift
SELECT lives_ok(
  $$ INSERT INTO ops_tasks (company_id, shift_id, title, source, column_key)
     VALUES ('00000000-0000-0000-0000-0000000063f1', '00000000-0000-0000-0000-0000000063f2',
             'Unfilled slots', 'auto_unfilled', 'todo') $$,
  '#112 first auto_unfilled card lands');
SELECT throws_ok(
  $$ INSERT INTO ops_tasks (company_id, shift_id, title, source, column_key)
     VALUES ('00000000-0000-0000-0000-0000000063f1', '00000000-0000-0000-0000-0000000063f2',
             'Unfilled slots again', 'auto_unfilled', 'todo') $$,
  '23505', NULL, '#112 duplicate active card rejected');

-- #113/#114: definers are internal — authenticated has no EXECUTE
SELECT is(
  has_function_privilege('authenticated', 'create_notification(uuid,text,text,text,text,jsonb)', 'EXECUTE'),
  false, '#113 create_notification is not client-callable');
SELECT is(
  has_function_privilege('authenticated', 'generate_shift_briefing(uuid)', 'EXECUTE'),
  false, '#114 generate_shift_briefing is not client-callable');
SELECT is(
  has_function_privilege('authenticated', 'worker_meets_shift_certs(uuid,uuid)', 'EXECUTE'),
  true, '#114 cert check stays client-callable — swap preview calls it by design');

-- #116: runner cannot reprice a confirmed order
RESET ROLE;
INSERT INTO food_runs (id, shift_id, runner_worker_id, restaurant, order_cutoff_at)
VALUES ('00000000-0000-0000-0000-0000000063b1', '00000000-0000-0000-0000-0000000063f2',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3'),
        'Pita Pit', now() + interval '5 days');
INSERT INTO food_run_orders (id, run_id, worker_id, item, price_cents, status)
VALUES ('00000000-0000-0000-0000-0000000063b2', '00000000-0000-0000-0000-0000000063b1',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2'),
        '#4 no onions', 1500, 'confirmed');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a3","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE food_run_orders SET price_cents = 3000 WHERE id = '00000000-0000-0000-0000-0000000063b2' $$,
  'Confirmed prices are locked', NULL, '#116 confirmed price is immutable to the runner');

SELECT * FROM finish();
ROLLBACK;
