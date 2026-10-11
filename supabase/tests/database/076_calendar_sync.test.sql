-- Lane B: two-way calendar sync. calendar_imports holds the worker's feed;
-- sync_calendar_import atomically replaces that import's availability blocks
-- (never appends, keeps last-known state on failure); synced blocks count as
-- hard conflicts in worker_travel_conflicts like any declared busy window.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b081', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cs-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b082', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cs-other@test.local', 'x', '{"full_name":"Other","role":"worker"}'::jsonb, now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b081","role":"authenticated"}', true);

-- 1: worker registers a feed
INSERT INTO calendar_imports (id, worker_id, name, feed_url)
SELECT '00000000-0000-0000-0000-00000000d601', id, 'Personal', 'https://cal.example.com/basic.ics'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b081';
SELECT pass('worker can register a calendar import');

-- 2: sync replaces blocks atomically
SELECT is(
  sync_calendar_import('00000000-0000-0000-0000-00000000d601',
    '[{"start":"2026-04-10T14:00:00Z","end":"2026-04-10T18:00:00Z","summary":"Dentist"},
      {"start":"2026-04-12T09:00:00Z","end":"2026-04-12T17:00:00Z","summary":"Family"}]'::jsonb, NULL),
  2, 'first sync writes two busy blocks');

-- 3: re-sync replaces, never appends
SELECT is(
  sync_calendar_import('00000000-0000-0000-0000-00000000d601',
    '[{"start":"2026-04-15T08:00:00Z","end":"2026-04-15T12:00:00Z","summary":"Moved"}]'::jsonb, NULL),
  1, 're-sync replaces the import''s blocks');

SELECT results_eq(
  $$ SELECT count(*)::int, bool_and(is_available = false), bool_and(notes IS NOT NULL)
       FROM availability WHERE import_id = '00000000-0000-0000-0000-00000000d601' $$,
  $$ VALUES (1, true, true) $$,
  'exactly one busy block remains, flagged not-available with a summary');

-- 4: a failed fetch keeps last-known blocks (never wipes them)
SELECT is(
  sync_calendar_import('00000000-0000-0000-0000-00000000d601', '[]'::jsonb, 'Feed returned HTTP 500'),
  -1, 'error path returns -1 and preserves blocks');

SELECT results_eq(
  $$ SELECT count(*)::int FROM availability WHERE import_id = '00000000-0000-0000-0000-00000000d601' $$,
  $$ VALUES (1) $$,
  'blocks survive a failed sync');

-- 5: synced busy blocks count as hard conflicts for matching
SELECT is(
  (SELECT hard_conflict FROM worker_travel_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b081')]::uuid[],
     '2026-04-15T10:00:00Z'::timestamptz, '2026-04-15T14:00:00Z'::timestamptz, NULL, NULL)),
  true, 'synced busy block is a hard conflict like a declared one');

-- 6: outsiders can't sync someone else's import
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b082","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT sync_calendar_import('00000000-0000-0000-0000-00000000d601', '[]'::jsonb, NULL) $$,
  'P0001', 'Calendar import not found', 'non-owner cannot sync another worker''s import');

SELECT * FROM finish();
ROLLBACK;
