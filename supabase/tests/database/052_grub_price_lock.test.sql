-- Regression: issue #52 — a runner could confirm an order at any price and the
-- orderer's debt minted at that price. A confirmed price is now locked, and a
-- price above the auto-accept cap mints only once the orderer accepts it.
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b521', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner52@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b522', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'runner52@test.local', 'x', '{"full_name":"Runner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b523', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'orderer52a@test.local', 'x', '{"full_name":"Orderer A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b524', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'orderer52b@test.local', 'x', '{"full_name":"Orderer B"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b525', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'orderer52c@test.local', 'x', '{"full_name":"Orderer C"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c520', 'Grub Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b521';
INSERT INTO events (id, company_id, name, starts_on, ends_on, status)
VALUES ('00000000-0000-0000-0000-00000000e520', '00000000-0000-0000-0000-00000000c520', 'Grub show', '2027-03-01', '2027-03-02', 'published');
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage)
VALUES ('00000000-0000-0000-0000-00000000d520', '00000000-0000-0000-0000-00000000e520',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open', 'public');

INSERT INTO food_runs (id, shift_id, runner_worker_id, restaurant, order_cutoff_at, status)
SELECT '52000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d520', p.id, 'Taqueria', '2027-03-01 06:00+00', 'open'::food_run_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b522';

-- two orders from two orderers, both still placed
INSERT INTO food_run_orders (id, run_id, worker_id, item, status)
SELECT '52000000-0000-0000-0000-0000000000b1', '52000000-0000-0000-0000-0000000000a1', p.id, 'Burrito', 'placed'::food_order_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b523';
INSERT INTO food_run_orders (id, run_id, worker_id, item, status)
SELECT '52000000-0000-0000-0000-0000000000b2', '52000000-0000-0000-0000-0000000000a1', p.id, 'Catering tray', 'placed'::food_order_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b524';

SET LOCAL ROLE authenticated;

-- runner confirms a routine price: under the cap, consent is implied and it mints
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b522","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE food_run_orders SET status = 'confirmed', price_cents = 1500 WHERE id = '52000000-0000-0000-0000-0000000000b1'
$$, 'runner confirms a routine $15 order');

-- runner confirms an inflated price: above the cap, it waits for the orderer
SELECT lives_ok($$
  UPDATE food_run_orders SET status = 'confirmed', price_cents = 90000 WHERE id = '52000000-0000-0000-0000-0000000000b2'
$$, 'runner confirms a $900 tray');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '52000000-0000-0000-0000-0000000000b1'), 1,
          'the routine order mints its debt at confirmation');
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '52000000-0000-0000-0000-0000000000b2'), 0,
          'the inflated order does not mint until the orderer accepts');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b522","role":"authenticated"}', true);

-- a confirmed price is locked, even against the runner
SELECT throws_ok($$
  UPDATE food_run_orders SET price_cents = 90000 WHERE id = '52000000-0000-0000-0000-0000000000b1'
$$, 'P0001', NULL, 'a confirmed price cannot be raised after the fact');

-- the runner cannot accept on the orderer's behalf
SELECT throws_ok($$
  UPDATE food_run_orders SET price_accepted_at = now() WHERE id = '52000000-0000-0000-0000-0000000000b2'
$$, 'P0001', NULL, 'runner cannot accept the orderer''s price for them');

-- the orderer accepts the $900 tray: now it mints
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b524","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE food_run_orders SET price_accepted_at = now() WHERE id = '52000000-0000-0000-0000-0000000000b2'
$$, 'orderer accepts the high price');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '52000000-0000-0000-0000-0000000000b2'
            AND amount_cents = 90000), 1,
          'accepting mints the debt once, at the price the orderer accepted');

-- pre-stamp dodge: an orderer-supplied price_accepted_at on INSERT would sit in
-- OLD on the confirm update, so the consent-mint would never fire — free food.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b525","role":"authenticated"}', true);
SELECT lives_ok($$
  INSERT INTO food_run_orders (id, run_id, worker_id, item, status, price_accepted_at)
  SELECT '52000000-0000-0000-0000-0000000000b3', '52000000-0000-0000-0000-0000000000a1', id, 'Sneaky fries', 'placed'::food_order_status, now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b525'
$$, 'orderer can place an order (pre-stamped consent gets stripped)');

RESET ROLE;
SELECT is((SELECT price_accepted_at IS NULL FROM food_run_orders WHERE id = '52000000-0000-0000-0000-0000000000b3'),
          true, 'insert-time price_accepted_at is forced NULL for API writers');

SELECT * FROM finish();
ROLLBACK;
