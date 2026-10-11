-- Lane B: bail fairness. A voluntary bail inside the policy window keeps a %
-- of the share committed; outside the window, host removals, and driver/host
-- cancellations still void fully.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b0d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bf-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bf-host@test.local', 'x', '{"full_name":"Host","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bf-bailer@test.local', 'x', '{"full_name":"Bailer","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bf-kicked@test.local', 'x', '{"full_name":"Kicked","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0ff', 'BailCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d044', '00000000-0000-0000-0000-00000000c0ff', 'Grounds', '4 Main', 37.8, -122.4);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0f4', '00000000-0000-0000-0000-00000000c0ff', '00000000-0000-0000-0000-00000000d044',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d1'), 'Shows', current_date, current_date + 3, 'published');

-- near shift: 12h out (inside 24h window); far shift: 48h out
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000e0f4', 'Near call', 'Stagehand', 4,
   now() + interval '12 hours', now() + interval '20 hours', 40, 'open'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000e0f4', 'Far call', 'Stagehand', 4,
   now() + interval '48 hours', now() + interval '56 hours', 40, 'open');

-- offers: near + far by host worker, plus a second near offer the host will cancel
INSERT INTO ride_offers (id, shift_id, driver_worker_id, seats, gas_share_cents)
SELECT '00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-00000000fa01', id, 3, 2000 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d2'
UNION ALL SELECT '00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-00000000fa02', id, 3, 2000 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d2'
UNION ALL SELECT '00000000-0000-0000-0000-000000009a03', '00000000-0000-0000-0000-00000000fa01', id, 2, 2000 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d2';

-- matched requests (IOUs mint at insert): bailer on near+far, kicked on the cancellable offer
INSERT INTO ride_requests (id, shift_id, rider_worker_id, seats_needed, status, offer_id)
SELECT '00000000-0000-0000-0000-000000009a11', '00000000-0000-0000-0000-00000000fa01', id, 1, 'matched', '00000000-0000-0000-0000-000000009a01' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d3'
UNION ALL SELECT '00000000-0000-0000-0000-000000009a12', '00000000-0000-0000-0000-00000000fa02', id, 1, 'matched', '00000000-0000-0000-0000-000000009a02' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d3'
UNION ALL SELECT '00000000-0000-0000-0000-000000009a13', '00000000-0000-0000-0000-00000000fa01', id, 1, 'matched', '00000000-0000-0000-0000-000000009a03' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d4';

-- lodging: near-shift pool hosted by host, bailer + kicked as members
INSERT INTO lodging_pools (id, shift_id, host_worker_id, name, kind, spots, share_cents, status)
SELECT '00000000-0000-0000-0000-000000009a21', '00000000-0000-0000-0000-00000000fa01', id, 'Suite', 'hotel', 4, 3000, 'open'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d2';

INSERT INTO pool_members (id, pool_id, worker_id, spots_needed, status)
SELECT '00000000-0000-0000-0000-000000009a31', '00000000-0000-0000-0000-000000009a21', id, 1, 'joined' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d3'
UNION ALL SELECT '00000000-0000-0000-0000-000000009a32', '00000000-0000-0000-0000-000000009a21', id, 1, 'joined' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d4';

-- bailer withdraws the near ride + leaves the pool + withdraws the far ride;
-- kicked gets removed from the pool; host cancels the third offer.
UPDATE ride_requests SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-000000009a11';
UPDATE pool_members SET status = 'left' WHERE id = '00000000-0000-0000-0000-000000009a31';
UPDATE ride_requests SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-000000009a12';
UPDATE pool_members SET status = 'removed' WHERE id = '00000000-0000-0000-0000-000000009a32';
UPDATE ride_offers SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-000000009a03';

-- 1: near-shift bail keeps 50% of the $20 gas share committed
SELECT results_eq(
  $$ SELECT status::text, amount_cents FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-000000009a01' $$,
  $$ VALUES ('committed'::text, 1000) $$,
  'late bail keeps half the gas share committed');

-- 2: the driver is told why the IOU shrank instead of voiding
SELECT ok(
  EXISTS (SELECT 1 FROM crew_alerts WHERE kind = 'iou' AND dedupe_key = 'bail:ride:00000000-0000-0000-0000-000000009a11'),
  'beneficiary gets a late-bail alert');

-- 3: the seat still frees — the offer reopens for a replacement
SELECT is(
  (SELECT seats_taken FROM ride_offers WHERE id = '00000000-0000-0000-0000-000000009a01'),
  0, 'bailed seat frees for a refill');

-- 4: far-shift (outside window) bail still voids fully
SELECT is(
  (SELECT status::text FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-000000009a02'),
  'void', 'bail outside the window voids the IOU');

-- 5: lodging: member's own leave inside the window keeps half of $30
SELECT results_eq(
  $$ SELECT status::text, amount_cents FROM crew_iou
      WHERE iou_group_id = '00000000-0000-0000-0000-000000009a21'
        AND worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d3') $$,
  $$ VALUES ('committed'::text, 1500) $$,
  'late bunk bail keeps half the lodging share');

-- 6: host-initiated removal inside the window voids fully — no bail for being kicked
SELECT is(
  (SELECT status::text FROM crew_iou
    WHERE iou_group_id = '00000000-0000-0000-0000-000000009a21'
      AND worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0d4')),
  'void', 'removed member owes nothing — bail only applies to voluntary exits');

-- 7: driver cancels the offer inside the window → riders void fully
SELECT is(
  (SELECT status::text FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-000000009a03'),
  'void', 'driver-cancelled ride voids the share — no bail owed for their cancel');

SELECT * FROM finish();
ROLLBACK;
