-- Red-team singles: #21 break_minutes floor, #30 crew-table booking gate,
-- #31 ride-cancel alert moved into the BEFORE path.
BEGIN;
SELECT plan(8);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000062a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ch-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000062a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ch-booked@test.local', 'x', '{"full_name":"Booked","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000062a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ch-squat@test.local', 'x', '{"full_name":"Squatter","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000062a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ch-driver@test.local', 'x', '{"full_name":"Driver","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000062f1', 'HardCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000062d1', '00000000-0000-0000-0000-0000000062f1', 'Stage', '9 Pike', 47.6, -122.3);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000062e1', '00000000-0000-0000-0000-0000000062f1', '00000000-0000-0000-0000-0000000062d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a1'), 'Gig', current_date + 5, current_date + 5, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage) VALUES
  ('00000000-0000-0000-0000-0000000062f2', '00000000-0000-0000-0000-0000000062e1', 'Spot', 'Spot Op', 4,
   now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 40, 'open', 'public');

-- a2 booked (confirmed), a4 booked (driver, offered), a3 NOT booked
INSERT INTO shift_assignments (id, shift_id, worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000062c1', '00000000-0000-0000-0000-0000000062f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a2'), 'confirmed'),
  ('00000000-0000-0000-0000-0000000062c2', '00000000-0000-0000-0000-0000000062f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a4'), 'offered');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a2","role":"authenticated"}', true);

-- #21: negative break is rejected by the CHECK
RESET ROLE;
SELECT throws_ok(
  $$ INSERT INTO timesheets (assignment_id, shift_id, worker_id, break_minutes)
     VALUES ('00000000-0000-0000-0000-0000000062c1', '00000000-0000-0000-0000-0000000062f2',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a2'), -30) $$,
  '23514', NULL, 'break_minutes has a >= 0 floor (#21)');
SET LOCAL ROLE authenticated;

-- #30: unbooked worker cannot squat a ride request — or a food order — or a pool
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a3","role":"authenticated"}', true);
SELECT throws_ok(
  $$ INSERT INTO ride_requests (shift_id, rider_worker_id, seats_needed)
     VALUES ('00000000-0000-0000-0000-0000000062f2',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a3'), 1) $$,
  '42501', NULL, 'unbooked worker cannot post a ride request (#30)');

SELECT throws_ok(
  $$ INSERT INTO food_runs (shift_id, runner_worker_id, restaurant, order_cutoff_at)
     VALUES ('00000000-0000-0000-0000-0000000062f2',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a3'),
             'Pizza', now() + interval '2 days') $$,
  '42501', NULL, 'unbooked worker cannot host a GrubRun either');

-- booked workers post fine: a4's offer + a2's request that matches it
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a4","role":"authenticated"}', true);
SELECT lives_ok(
  $$ INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents)
     VALUES ('00000000-0000-0000-0000-0000000062b1', '00000000-0000-0000-0000-0000000062f2',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a4'), 2, 2000) $$,
  'booked driver posts an offer');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a2","role":"authenticated"}', true);
SELECT lives_ok(
  $$ INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status, offer_id)
     VALUES ('00000000-0000-0000-0000-0000000062c3', '00000000-0000-0000-0000-0000000062f2',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a2'),
             1, 'matched', '00000000-0000-0000-0000-0000000062b1') $$,
  'booked rider matches the offer');

-- #31: cancelling the offer alerts the matched rider AND frees their request
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a4","role":"authenticated"}', true);
UPDATE ride_offers SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-0000000062b1';

RESET ROLE;
SELECT ok(EXISTS(
    SELECT 1 FROM crew_alerts
     WHERE dedupe_key LIKE '%alert:ride-cancelled:00000000-0000-0000-0000-0000000062c3'
       AND worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000062a2')),
  'matched rider actually gets the cancellation alert (#31)');

SELECT is(
  (SELECT status FROM ride_requests WHERE id = '00000000-0000-0000-0000-0000000062c3'),
  'open'::ride_request_status, 'rider returns to the pool');

SELECT ok(NOT EXISTS(
    SELECT 1 FROM crew_iou
     WHERE iou_group_id = '00000000-0000-0000-0000-0000000062b1' AND status = 'committed'),
  'gas IOU voided with the offer');

SELECT * FROM finish();
ROLLBACK;
