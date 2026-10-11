-- Lane B #3: auto-backfill cascade + no-show detection.
-- Losing a seat re-offers to the next-ranked roster candidate; an exhausted
-- pool spawns an urgent ops card + owner notification; the sweep flips
-- confirmed crew who never clocked in by call+15min.
BEGIN;
SELECT plan(12);

-- ============================================================================
-- fixtures: owner+company, roster pair (w1 core / w2 preferred), outsider w3
-- ============================================================================
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ab-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ab-w1@test.local', 'x', '{"full_name":"W1","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b023', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ab-w2@test.local', 'x', '{"full_name":"W2","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b024', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ab-w3@test.local', 'x', '{"full_name":"W3","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0d1', 'BackfillCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b021';

INSERT INTO venues (id, company_id, name, address, latitude, longitude)
VALUES ('00000000-0000-0000-0000-00000000d0e1',
        '00000000-0000-0000-0000-00000000c0d1', 'Arena', '1 Main St', 40.0, -74.0);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status)
SELECT '00000000-0000-0000-0000-00000000e0f1', '00000000-0000-0000-0000-00000000c0d1',
       '00000000-0000-0000-0000-00000000d0e1', id, 'BackfillFest', current_date - 1, current_date + 1, 'published'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b021';

-- roster: w1 core, w2 preferred; w3 deliberately NOT on the roster
INSERT INTO preferred_rosters (company_id, worker_id, tier)
SELECT '00000000-0000-0000-0000-00000000c0d1'::uuid, id, 'core' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b022'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000c0d1', id, 'preferred' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b023';

-- shift1: running now, w1 booked (decline → cascade to w2)
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000e0f1',
        'Deck call', 'Stagehand', 1, now() - interval '3 hours', now() + interval '4 hours', 40.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000f101', id,
       'roster_broadcast', 'confirmed', now() - interval '1 day'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b022';

-- shift2: running now, w1 booked (no-show → sweep flags → cascade to w2)
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000e0f1',
        'Spot op', 'Followspot', 1, now() - interval '2 hours', now() + interval '3 hours', 42.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000f102', id,
       'direct_book', 'confirmed', now() - interval '1 day'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b022';

-- shift3: future call, outsider w3 booked — must never be swept or backfilled
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000e0f1',
        'Load-out', 'Stagehand', 1, now() + interval '3 hours', now() + interval '8 hours', 40.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-00000000f103', id,
       'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b024';

-- ============================================================================
-- 1. decline cascades: next-ranked roster member gets the offer
-- ============================================================================
UPDATE shift_assignments SET status = 'declined' WHERE id = '00000000-0000-0000-0000-00000000a101';

SELECT is(
  (SELECT count(*)::int FROM shift_assignments a JOIN profiles p ON p.id = a.worker_id
    WHERE a.shift_id = '00000000-0000-0000-0000-00000000f101' AND p.user_id = '00000000-0000-0000-0000-00000000b023'
      AND a.status = 'offered'),
  1, 'decline auto-offers the next-ranked roster worker');

SELECT is(
  (SELECT source::text FROM shift_assignments
    WHERE shift_id = '00000000-0000-0000-0000-00000000f101' AND status = 'offered'),
  'roster_broadcast', 'backfill offer carries roster source');

SELECT is(
  (SELECT count(*)::int FROM notifications n JOIN profiles p ON p.id = n.user_id
    WHERE p.user_id = '00000000-0000-0000-0000-00000000b023' AND n.title LIKE 'Call offer:%'),
  1, 'offered worker is paged');

SELECT is(
  (SELECT count(*)::int FROM shift_assignments a JOIN profiles p ON p.id = a.worker_id
    WHERE a.shift_id = '00000000-0000-0000-0000-00000000f101' AND p.user_id = '00000000-0000-0000-0000-00000000b022'),
  1, 'declined worker is never re-offered');

SELECT is(
  (SELECT count(*)::int FROM shift_assignments a JOIN profiles p ON p.id = a.worker_id
    WHERE p.user_id = '00000000-0000-0000-0000-00000000b024'
      AND a.shift_id IN ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f102')),
  0, 'non-roster workers stay out of the cascade');

-- ============================================================================
-- 2. pool exhausted → urgent ops card + owner notification
-- ============================================================================
UPDATE shift_assignments SET status = 'declined'
 WHERE shift_id = '00000000-0000-0000-0000-00000000f101' AND status = 'offered';

SELECT is(
  (SELECT count(*)::int FROM ops_tasks
    WHERE shift_id = '00000000-0000-0000-0000-00000000f101' AND source = 'auto_backfill' AND priority = 'urgent'),
  1, 'exhausted pool spawns an urgent ops card');

SELECT is(
  (SELECT count(*)::int FROM notifications n JOIN profiles p ON p.id = n.user_id
    WHERE p.user_id = '00000000-0000-0000-0000-00000000b021' AND n.title = 'Backfill pool exhausted'),
  1, 'owner gets paged when the pool runs dry');

-- ============================================================================
-- 3. sweep: confirmed, call+15min, no clock-in → no_show → cascade
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b021","role":"authenticated"}', true);

SELECT is(detect_no_shows('00000000-0000-0000-0000-00000000c0d1'), 1, 'sweep flags the running-call no-show');

SELECT is(
  (SELECT status::text FROM shift_assignments WHERE id = '00000000-0000-0000-0000-00000000a102'),
  'no_show', 'confirmed seat with no clock-in flips to no_show');

SELECT is(
  (SELECT count(*)::int FROM shift_assignments a JOIN profiles p ON p.id = a.worker_id
    WHERE a.shift_id = '00000000-0000-0000-0000-00000000f102' AND p.user_id = '00000000-0000-0000-0000-00000000b023'
      AND a.status = 'offered'),
  1, 'no-show also triggers the backfill cascade');

SELECT is(detect_no_shows('00000000-0000-0000-0000-00000000c0d1'), 0, 'sweep is idempotent');

SELECT is(
  (SELECT status::text FROM shift_assignments WHERE id = '00000000-0000-0000-0000-00000000a103'),
  'confirmed', 'future-call crew are never flagged');

SELECT * FROM finish();
ROLLBACK;
