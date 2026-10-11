-- Red-team #52 — GrubRun price lock: quoted price commits at claim; the
-- runner confirms ≤ quoted×(1+variance); above that the order parks in
-- 'price_review' until the ORDERER accepts — the IOU only mints on confirm.
BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000061a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gl-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000061a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gl-runner@test.local', 'x', '{"full_name":"Runner","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000061a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gl-eater@test.local', 'x', '{"full_name":"Eater","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000061a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gl-eater2@test.local', 'x', '{"full_name":"Eater Two","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000061f1', 'FoodCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000061a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000061d1', '00000000-0000-0000-0000-0000000061f1', 'Hall', '5 Broad', 30.4, -97.7);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000061e1', '00000000-0000-0000-0000-0000000061f1', '00000000-0000-0000-0000-0000000061d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000061a1'), 'Gala', current_date + 4, current_date + 4, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000061f2', '00000000-0000-0000-0000-0000000061e1', 'Serve', 'Server', 4,
   now() + interval '4 days', now() + interval '4 days' + interval '6 hours', 30, 'open');

INSERT INTO food_runs (id, shift_id, runner_worker_id, restaurant, order_cutoff_at, status) VALUES
  ('00000000-0000-0000-0000-0000000061b1', '00000000-0000-0000-0000-0000000061f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000061a2'),
   'Taco Joe', now() + interval '2 days', 'open');

SET LOCAL ROLE authenticated;

-- an order without a committed quote is rejected at the gate
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000061a3","role":"authenticated"}', true);
SELECT throws_ok(
  $$ INSERT INTO food_run_orders (run_id, worker_id, item)
     VALUES ('00000000-0000-0000-0000-0000000061b1',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000061a3'), '#4') $$,
  'P0001', NULL, 'orders must commit a quoted price');

-- quote 1000 → runner confirms 1200 (≤1250 cap) → confirmed + IOU minted
INSERT INTO food_run_orders (id, run_id, worker_id, item, quoted_price_cents)
VALUES ('00000000-0000-0000-0000-0000000061c1', '00000000-0000-0000-0000-0000000061b1',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000061a3'), '#4', 1000);

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000061a2","role":"authenticated"}', true);
SELECT is(confirm_food_order('00000000-0000-0000-0000-0000000061c1', 1200), 'confirmed'::food_order_status,
  'within-variance confirm lands directly');
SELECT ok(EXISTS(SELECT 1 FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-0000000061c1' AND amount_cents = 1200 AND status = 'committed'),
  'in-variance confirm mints the IOU');

-- quote 1000 → runner tries 2000: direct update throws; RPC parks it for review
RESET ROLE;
INSERT INTO food_run_orders (id, run_id, worker_id, item, quoted_price_cents)
VALUES ('00000000-0000-0000-0000-0000000061c2', '00000000-0000-0000-0000-0000000061b1',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000061a4'), '#7', 1000);
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000061a2","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE food_run_orders SET status = 'confirmed', price_cents = 2000 WHERE id = '00000000-0000-0000-0000-0000000061c2' $$,
  '42501', NULL, 'above-variance direct confirm is rejected');

SELECT is(confirm_food_order('00000000-0000-0000-0000-0000000061c2', 2000), 'price_review'::food_order_status,
  'above-variance confirm parks in price_review');
SELECT ok(NOT EXISTS(SELECT 1 FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-0000000061c2'),
  'no IOU while the price is under review');

-- a non-orderer can't bounce; the orderer can — order returns to placed
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000061a3","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT reject_food_price('00000000-0000-0000-0000-0000000061c2') $$,
  '42501', NULL, 'only the orderer can bounce the price');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000061a4","role":"authenticated"}', true);
SELECT lives_ok(
  $$ SELECT reject_food_price('00000000-0000-0000-0000-0000000061c2') $$,
  'orderer bounce returns the order to placed');
SELECT is(
  (SELECT status FROM food_run_orders WHERE id = '00000000-0000-0000-0000-0000000061c2'),
  'placed'::food_order_status, 'order is placed again after the bounce');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
