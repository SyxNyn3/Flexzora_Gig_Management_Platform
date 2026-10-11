-- Lane B #5: travel-time feasibility. The company-side matcher swaps the flat
-- buffer for venue-to-venue travel: gap < needed → infeasible, inside
-- needed+60 → tight.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tf-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tf-w1@test.local', 'x', '{"full_name":"W1","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b043', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tf-w2@test.local', 'x', '{"full_name":"W2","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b044', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tf-w3@test.local', 'x', '{"full_name":"W3","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0f1', 'TravelCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b041';

-- candidate venue: downtown LA; far venue: Las Vegas (~370 km); near: Anaheim (~45 km)
INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c0f1', 'LA Arena', '1 LA', 34.0430, -118.2673),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c0f1', 'Vegas Dome', '1 LV', 36.1699, -115.1398),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000c0f1', 'Anaheim Hall', '1 AN', 33.8366, -117.9143);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status)
SELECT '00000000-0000-0000-0000-00000000e0b1', '00000000-0000-0000-0000-00000000c0f1',
       '00000000-0000-0000-0000-00000000d001', id, 'LA Gig', current_date, current_date, 'published'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b041';
INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status)
SELECT '00000000-0000-0000-0000-00000000e0b2', '00000000-0000-0000-0000-00000000c0f1',
       '00000000-0000-0000-0000-00000000d002', id, 'Vegas Gig', current_date, current_date, 'published'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b041';
INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status)
SELECT '00000000-0000-0000-0000-00000000e0b3', '00000000-0000-0000-0000-00000000c0f1',
       '00000000-0000-0000-0000-00000000d003', id, 'Anaheim Gig', current_date, current_date, 'published'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b041';

-- w1: confirmed in Vegas until 15:00, candidate LA call 16:00 → gap 60min, needs ~470
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000e0b2',
        'Vegas morning', 'Stagehand', 1, now() + interval '1 hours', now() + interval '3 hours', 40.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a301', '00000000-0000-0000-0000-00000000f301', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b042';

-- w2: confirmed in Anaheim until gap=90min before the call → needs ~84 → tight, not infeasible
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000f302', '00000000-0000-0000-0000-00000000e0b3',
        'Anaheim morning', 'Stagehand', 1, now() + interval '30 minutes', now() + interval '2 hours', 40.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a302', '00000000-0000-0000-0000-00000000f302', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b043';

WITH wid AS (
  SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b042'
  UNION SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b043'
  UNION SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b044'
), res AS (
  SELECT * FROM worker_travel_conflicts(
    (SELECT array_agg(id) FROM wid),
    now() + interval '4 hours',   -- candidate call starts 3h after w1's Vegas wrap (60min after… see below)
    now() + interval '8 hours',
    34.0430, -118.2673)
)
SELECT 1 FROM res; -- shape check only; assertions below use direct calls

SELECT ok(
  travel_minutes(34.0430, -118.2673, 36.1699, -115.1398) BETWEEN 400 AND 520,
  'LA→Vegas travel estimate lands around 7-8 hours');

SELECT is(
  (SELECT travel_infeasible FROM worker_travel_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b042')],
     now() + interval '4 hours', now() + interval '8 hours', 34.0430, -118.2673)),
  true, 'Vegas→LA hop inside an hour is infeasible');

SELECT is(
  (SELECT hard_conflict FROM worker_travel_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b042')],
     now() + interval '4 hours', now() + interval '8 hours', 34.0430, -118.2673)),
  false, 'infeasible is reported separately from overlap');

SELECT is(
  (SELECT travel_infeasible FROM worker_travel_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b043')],
     now() + interval '4 hours', now() + interval '8 hours', 34.0430, -118.2673)),
  false, 'Anaheim→LA with a 2h gap is still feasible');

SELECT is(
  (SELECT travel_tight FROM worker_travel_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b043')],
     now() + interval '4 hours', now() + interval '8 hours', 34.0430, -118.2673)),
  true, '…but flagged tight (inside travel + 1h slack)');

SELECT is(
  (SELECT count(*)::int FROM worker_travel_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b044')],
     now() + interval '4 hours', now() + interval '8 hours', 34.0430, -118.2673)
   WHERE hard_conflict OR travel_infeasible OR travel_tight),
  0, 'unbooked worker is fully clear');

SELECT * FROM finish();
ROLLBACK;
