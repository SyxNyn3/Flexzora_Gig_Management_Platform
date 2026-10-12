-- Regression: issue #25 — one rider could hold several active ride requests on
-- the same shift, matching onto several offers: duplicate seats and duplicate
-- gas-share IOUs. A partial unique index now allows one active request per rider
-- per shift.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b251', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner25@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b252', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver25a@test.local', 'x', '{"full_name":"Driver A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b253', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver25b@test.local', 'x', '{"full_name":"Driver B"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b254', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rider25@test.local', 'x', '{"full_name":"Rider"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c250', 'Ride Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b251';
INSERT INTO events (id, company_id, name, starts_on, ends_on, status)
VALUES ('00000000-0000-0000-0000-00000000e250', '00000000-0000-0000-0000-00000000c250', 'Ride show', '2027-03-01', '2027-03-02', 'published');
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage)
VALUES ('00000000-0000-0000-0000-00000000d250', '00000000-0000-0000-0000-00000000e250',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open', 'public');

INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents, status)
SELECT '25000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000d250', p.id, 2, 500, 'open'::ride_offer_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b252';
INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents, status)
SELECT '25000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-00000000d250', p.id, 2, 500, 'open'::ride_offer_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b253';

-- #30: the rider needs a live booking to post requests at all
INSERT INTO shift_assignments (id, shift_id, worker_id, status)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-00000000d250', p.id, 'confirmed'
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b254';

-- the rider's one legitimate match (sync trigger takes the seat and mints the IOU)
INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status, offer_id)
SELECT '25000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-00000000d250', p.id, 1, 'matched'::ride_request_status,
       '25000000-0000-0000-0000-0000000001a1'
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b254';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b254","role":"authenticated"}', true);

SELECT throws_ok($$
  INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status)
  SELECT '25000000-0000-0000-0000-0000000002a2', '00000000-0000-0000-0000-00000000d250', p.id, 1, 'open'::ride_request_status
  FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b254'
$$, '23505', NULL, 'rider cannot open a second active request on the same call');

SELECT throws_ok($$
  INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status, offer_id)
  SELECT '25000000-0000-0000-0000-0000000002a3', '00000000-0000-0000-0000-00000000d250', p.id, 1, 'matched'::ride_request_status,
         '25000000-0000-0000-0000-0000000001a2'
  FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b254'
$$, '23505', NULL, 'rider cannot double-match onto a second offer');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b254')), 1,
          'exactly one gas-share IOU was minted for the rider');
SELECT is((SELECT seats_taken FROM ride_offers WHERE id = '25000000-0000-0000-0000-0000000001a1'), 1,
          'one seat is taken on the matched offer');
SELECT is((SELECT seats_taken FROM ride_offers WHERE id = '25000000-0000-0000-0000-0000000001a2'), 0,
          'the second offer keeps its seats');

SELECT * FROM finish();
ROLLBACK;
