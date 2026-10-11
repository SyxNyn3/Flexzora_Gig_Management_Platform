-- Regression: issue #26 — the hiring company could force any open ride request
-- to 'matched', creating a non-consensual gas-share IOU against the rider. The
-- company may now only cancel a request; matching and offer reassignment need
-- the rider.
BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b261', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner26@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b262', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver26@test.local', 'x', '{"full_name":"Driver"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b263', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rider26@test.local', 'x', '{"full_name":"Rider"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c260', 'Force Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b261';
INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e260', '00000000-0000-0000-0000-00000000c260', 'Force show', '2027-03-01', '2027-03-02');
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d260', '00000000-0000-0000-0000-00000000e260',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open');

INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents, status)
SELECT '26000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000d260', p.id, 2, 500, 'open'::ride_offer_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b262';

-- rider's open request (no offer yet)
INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status)
SELECT '26000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-00000000d260', p.id, 1, 'open'::ride_request_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b263';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b261","role":"authenticated"}', true);

-- the company cannot force a match
SELECT throws_ok($$
  UPDATE ride_requests SET status = 'matched', offer_id = '26000000-0000-0000-0000-0000000001a1'
  WHERE id = '26000000-0000-0000-0000-0000000002a1'
$$, 'P0001', NULL, 'company cannot force-match a rider');

-- but it can cancel the request
SELECT lives_ok($$
  UPDATE ride_requests SET status = 'cancelled' WHERE id = '26000000-0000-0000-0000-0000000002a1'
$$, 'company cancels the request');

RESET ROLE;
SELECT is((SELECT status::text FROM ride_requests WHERE id = '26000000-0000-0000-0000-0000000002a1'), 'cancelled',
          'the cancelled request is closed');

-- a fresh open request: the company cannot reassign it to an offer either
INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status)
SELECT '26000000-0000-0000-0000-0000000002a2', '00000000-0000-0000-0000-00000000d260', p.id, 1, 'open'::ride_request_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b263';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b261","role":"authenticated"}', true);
SELECT throws_ok($$
  UPDATE ride_requests SET offer_id = '26000000-0000-0000-0000-0000000001a1'
  WHERE id = '26000000-0000-0000-0000-0000000002a2'
$$, 'P0001', NULL, 'company cannot reassign an open request to an offer');

SELECT * FROM finish();
ROLLBACK;
