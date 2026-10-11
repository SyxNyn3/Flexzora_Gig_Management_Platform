-- Regression: issue #27 — seats_needed could be changed after a match. The offer's
-- seat ledger and the minted gas-share IOU were sized from the old value, so the
-- rider could free seats or keep a stale amount. Seats freeze once matched.
BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b271', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner27@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b272', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver27@test.local', 'x', '{"full_name":"Driver"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b273', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rider27@test.local', 'x', '{"full_name":"Rider"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c270', 'Seats Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b271';
INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e270', '00000000-0000-0000-0000-00000000c270', 'Seats show', '2027-03-01', '2027-03-02');
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d270', '00000000-0000-0000-0000-00000000e270',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open');

INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents, status)
SELECT '27000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000d270', p.id, 3, 500, 'open'::ride_offer_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b272';

-- the rider's match (sync trigger takes one seat and mints a 500-cent share)
INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status, offer_id)
SELECT '27000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-00000000d270', p.id, 1, 'matched'::ride_request_status,
       '27000000-0000-0000-0000-0000000001a1'
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b273';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b273","role":"authenticated"}', true);

-- the rider cannot change the count after matching
SELECT throws_ok($$
  UPDATE ride_requests SET seats_needed = 2 WHERE id = '27000000-0000-0000-0000-0000000002a1'
$$, 'P0001', NULL, 'matched rider cannot change seats (seat ledger and IOU would drift)');

-- ordinary edits to a matched request still work
SELECT lives_ok($$
  UPDATE ride_requests SET notes = 'Two cases of water' WHERE id = '27000000-0000-0000-0000-0000000002a1'
$$, 'matched rider can still edit notes');

RESET ROLE;
SELECT is((SELECT seats_taken FROM ride_offers WHERE id = '27000000-0000-0000-0000-0000000001a1'), 1,
          'the seat ledger still reflects the original single seat');

SELECT * FROM finish();
ROLLBACK;
