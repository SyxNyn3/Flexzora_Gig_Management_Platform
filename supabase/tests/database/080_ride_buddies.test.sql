-- Lane B: recurring ride buddies. Matched ride history → buddy briefing on the
-- next shared confirm + worker_ride_buddies/my_last_ride_offer for the board.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b0c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rb-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rb-driver@test.local', 'x', '{"full_name":"Dana Driver","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rb-rider@test.local', 'x', '{"full_name":"Rae Rider","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0fe', 'BuddyCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d043', '00000000-0000-0000-0000-00000000c0fe', 'Fairgrounds', '3 Main', 37.8, -122.4);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0f3', '00000000-0000-0000-0000-00000000c0fe', '00000000-0000-0000-0000-00000000d043',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c1'), 'Weeks', current_date - 10, current_date + 10, 'published');

-- f901 = last week's call (history), f902 = this week's call (the new confirm)
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f901', '00000000-0000-0000-0000-00000000e0f3', 'Last call', 'Stagehand', 2,
   now() - interval '7 days', now() - interval '7 days' + interval '8 hours', 40, 'completed'),
  ('00000000-0000-0000-0000-00000000f902', '00000000-0000-0000-0000-00000000e0f3', 'Next call', 'Stagehand', 2,
   now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 40, 'open');

-- history: Dana drove Rae to last week's call
INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, seats_taken, departure_area, gas_share_cents, status)
SELECT '00000000-0000-0000-0000-000000009901', '00000000-0000-0000-0000-00000000f901', id, 3, 1, 'Hotel lobby', 1500, 'full'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c2';

INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status, offer_id)
SELECT '00000000-0000-0000-0000-000000009902', '00000000-0000-0000-0000-00000000f901', id, 1, 'matched', '00000000-0000-0000-0000-000000009901'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c3';

-- Dana confirms on the new call first (no buddy alert yet — Rae isn't on it)
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000f902', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c2';

-- Dana posts seats on the new call before Rae confirms
INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, departure_area, gas_share_cents)
SELECT '00000000-0000-0000-0000-000000009903', '00000000-0000-0000-0000-00000000f902', id, 3, 'Hotel lobby', 1500
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c2';

-- 1: Dana's confirm emitted no buddy alert (Rae not confirmed yet)
SELECT is(
  (SELECT count(*)::int FROM crew_alerts WHERE kind = 'ride_buddy'),
  0, 'no buddy alert while only one of the pair is confirmed');

-- Rae confirms → briefing sees Dana confirmed on the call
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a902', '00000000-0000-0000-0000-00000000f902', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c3';

-- 2: Rae got the "drove you" alert pointing at Dana
SELECT results_eq(
  $$ SELECT body LIKE 'Dana Driver drove you once%', ref_id FROM crew_alerts
      WHERE worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c3')
        AND kind = 'ride_buddy' $$,
  $$ SELECT true, (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c2') $$,
  'second confirmer gets the buddy alert naming the driver');

-- 3: Dana got the mirrored "rode with you" alert (she confirmed first)
SELECT results_eq(
  $$ SELECT body LIKE 'Rae Rider rode with you once%', ref_id FROM crew_alerts
      WHERE worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c2')
        AND kind = 'ride_buddy' $$,
  $$ SELECT true, (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0c3') $$,
  'first confirmer gets the mirrored buddy alert');

-- 4/5: the board RPC — Rae sees Dana confirmed with her open offer attached
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0c3","role":"authenticated"}', true);

SELECT results_eq(
  $$ SELECT buddy_name, rides_together, i_drove_last, buddy_confirmed FROM worker_ride_buddies('00000000-0000-0000-0000-00000000f902') $$,
  $$ VALUES ('Dana Driver'::text, 1::bigint, false, true) $$,
  'rider-side buddy list names the driver with direction + confirmation');

SELECT is(
  (SELECT buddy_offer_id FROM worker_ride_buddies('00000000-0000-0000-0000-00000000f902')),
  '00000000-0000-0000-0000-000000009903'::uuid,
  'buddy list carries the open offer for one-tap join');

-- 6: driver-side pre-fill returns the newest live offer
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0c2","role":"authenticated"}', true);
SELECT results_eq(
  $$ SELECT seats, departure_area, gas_share_cents FROM my_last_ride_offer() $$,
  $$ VALUES (3, 'Hotel lobby'::text, 1500) $$,
  'last-offer RPC returns the newest live offer for pre-fill');

SELECT * FROM finish();
ROLLBACK;
