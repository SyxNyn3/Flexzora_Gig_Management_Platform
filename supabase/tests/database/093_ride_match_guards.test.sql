-- Red-team ride-match batch: one live request per rider (#25), company
-- moderation-only (#26), seats/offer lock at match (#27).
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000060a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rm-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000060a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rm-rider@test.local', 'x', '{"full_name":"Rider","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000060a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rm-driver@test.local', 'x', '{"full_name":"Driver","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000060f1', 'RideCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000060a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000060d1', '00000000-0000-0000-0000-0000000060f1', 'Lot', '10 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000060e1', '00000000-0000-0000-0000-0000000060f1', '00000000-0000-0000-0000-0000000060d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000060a1'), 'Show', current_date + 3, current_date + 3, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000060f2', '00000000-0000-0000-0000-0000000060e1', 'Rig', 'Rigger', 3,
   now() + interval '3 days', now() + interval '3 days' + interval '8 hours', 45, 'open');

INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents) VALUES
  ('00000000-0000-0000-0000-0000000060b1', '00000000-0000-0000-0000-0000000060f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000060a3'), 3, 1500);

INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status) VALUES
  ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000060a2'), 1, 'open'),
  ('00000000-0000-0000-0000-0000000060c2', '00000000-0000-0000-0000-0000000060f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000060a3'), 2, 'matched');

UPDATE ride_requests SET offer_id = '00000000-0000-0000-0000-0000000060b1' WHERE id = '00000000-0000-0000-0000-0000000060c2';

SET LOCAL ROLE authenticated;

-- #25: the rider can't hold a second live request on the same shift
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000060a2","role":"authenticated"}', true);
SELECT throws_ok(
  $$ INSERT INTO ride_requests (shift_id, rider_worker_id, seats_needed)
     VALUES ('00000000-0000-0000-0000-0000000060f2',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000060a2'), 1) $$,
  '23505', NULL, 'one live request per rider per shift (#25)');

-- #26: company cannot force-match a rider into an offer
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000060a1","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE ride_requests SET status = 'matched', offer_id = '00000000-0000-0000-0000-0000000060b1'
     WHERE id = '00000000-0000-0000-0000-0000000060c1' $$,
  '42501', NULL, 'company cannot force-match (#26)');

SELECT throws_ok(
  $$ UPDATE ride_requests SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-0000000060c1' $$,
  '42501', NULL, 'company cannot withdraw either');

SELECT lives_ok(
  $$ UPDATE ride_requests SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-0000000060c1' $$,
  'company moderation cancel still works');

-- #27: matched rider cannot retcon seats or re-point the offer
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000060a3","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE ride_requests SET seats_needed = 1 WHERE id = '00000000-0000-0000-0000-0000000060c2' $$,
  '42501', NULL, 'seats_needed locks once matched (#27)');

SELECT throws_ok(
  $$ UPDATE ride_requests SET offer_id = NULL WHERE id = '00000000-0000-0000-0000-0000000060c2' $$,
  '42501', NULL, 'offer_id is system-managed');

SELECT lives_ok(
  $$ UPDATE ride_requests SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-0000000060c2' $$,
  'matched rider can still withdraw');

SELECT * FROM finish();
ROLLBACK;
