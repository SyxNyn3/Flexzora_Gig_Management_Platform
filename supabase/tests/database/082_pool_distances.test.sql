-- Lane B: pool suggestions by distance. crew_pool_distances ranks pinned
-- options: rides by home→pickup→venue detour, bunks/food by venue distance;
-- unpinned rows emit nothing.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b0e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'pd-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'pd-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'pd-nowhere@test.local', 'x', '{"full_name":"NoGeo","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c1aa', 'DistCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e1';

-- venue at the origin; worker home ~11km north
INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d045', '00000000-0000-0000-0000-00000000c1aa', 'Fair', '5 Main', 0, 0);

INSERT INTO worker_sensitive (worker_id, latitude, longitude)
SELECT id, 0.1, 0 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e2';

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0f5', '00000000-0000-0000-0000-00000000c1aa', '00000000-0000-0000-0000-00000000d045',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e1'), 'Show', current_date + 4, current_date + 4, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000e0f5', 'Call', 'Stagehand', 4,
   now() + interval '4 days', now() + interval '4 days' + interval '8 hours', 40, 'open');

-- rides: A pinned halfway home→venue (tiny detour), B pinned south of venue (big detour), C unpinned
INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, departure_lat, departure_lng)
SELECT '00000000-0000-0000-0000-000000009b01'::uuid, '00000000-0000-0000-0000-00000000fb01'::uuid, id, 3, 0.05, 0 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e2'::uuid
UNION ALL SELECT '00000000-0000-0000-0000-000000009b02'::uuid, '00000000-0000-0000-0000-00000000fb01'::uuid, id, 3, -0.1, 0 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e2'::uuid
UNION ALL SELECT '00000000-0000-0000-0000-000000009b03'::uuid, '00000000-0000-0000-0000-00000000fb01'::uuid, id, 3, NULL, NULL FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e2'::uuid;

-- bunk ~2km from venue + a food pickup ~11km away
INSERT INTO lodging_pools (id, shift_id, host_worker_id, name, kind, spots, share_cents, geo_lat, geo_lng)
SELECT '00000000-0000-0000-0000-000000009b11', '00000000-0000-0000-0000-00000000fb01', id, 'Bunk', 'hotel', 3, 3000, 0.02, 0
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e2';

INSERT INTO food_runs (id, shift_id, runner_worker_id, restaurant, order_cutoff_at, pickup_lat, pickup_lng)
SELECT '00000000-0000-0000-0000-000000009b21', '00000000-0000-0000-0000-00000000fb01', id, 'Tacos', now() + interval '4 days', 0.1, 0
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0e2';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0e2","role":"authenticated"}', true);

-- 1: the on-the-way offer shows near-zero detour
SELECT ok(
  (SELECT detour_km FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') WHERE ref_id = '00000000-0000-0000-0000-000000009b01') < 1.5,
  'pickup on the home→venue path reads as ~no detour');

-- 2: the far offer ranks strictly worse
SELECT ok(
  (SELECT detour_km FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') WHERE ref_id = '00000000-0000-0000-0000-000000009b02')
  > (SELECT detour_km FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') WHERE ref_id = '00000000-0000-0000-0000-000000009b01'),
  'off-route pickup carries a larger detour');

-- 3: unpinned offers emit no row
SELECT is(
  (SELECT count(*)::int FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') WHERE ref_id = '00000000-0000-0000-0000-000000009b03'),
  0, 'unpinned offer sorts last by absence, not a fake zero');

-- 4: bunk distance is pool→venue (~2km)
SELECT ok(
  (SELECT km FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') WHERE ref_id = '00000000-0000-0000-0000-000000009b11') BETWEEN 1.5 AND 3,
  'bunk distance measures to the venue');

-- 5: food pickup distance lands too (~11km at home)
SELECT ok(
  (SELECT km FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') WHERE ref_id = '00000000-0000-0000-0000-000000009b21') BETWEEN 9 AND 13,
  'food run distance measures pickup→venue');

-- 6: a worker with no home geo still gets venue distances, just no ride detours
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0e3","role":"authenticated"}', true);
SELECT results_eq(
  $$ SELECT count(*) FILTER (WHERE kind = 'ride')::int, count(*) FILTER (WHERE kind = 'lodging')::int
     FROM crew_pool_distances('00000000-0000-0000-0000-00000000fb01') $$,
  $$ VALUES (0, 1) $$,
  'no home geo → bunk/food distances still returned, ride detours skipped');

SELECT * FROM finish();
ROLLBACK;
