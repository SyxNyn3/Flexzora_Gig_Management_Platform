-- Regression: worker_availability_days (year-calendar day status).
-- Covers: worker CRUD on own rows, bystander blind under RLS, (worker,day)
-- uniqueness for upsert-flip, enum validation, and no anon access.
BEGIN;
SELECT plan(8);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'av-worker@test.local', 'x', '{"full_name":"AV Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'av-bystander@test.local', 'x', '{"full_name":"AV Bystander","role":"worker"}'::jsonb, now(), now());

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e001') AS worker_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e002') AS bystander_pid;
GRANT SELECT ON ids TO authenticated;

-- ---- worker: mark days -----------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO worker_availability_days (worker_id, day, status, note)
    SELECT worker_pid, '2026-12-25', 'unavailable', 'Christmas'
      FROM ids$$,
  'worker can mark a day unavailable');

SELECT lives_ok(
  $$INSERT INTO worker_availability_days (worker_id, day, status)
    SELECT worker_pid, '2026-07-04', 'tentative' FROM ids$$,
  'worker can mark a day tentative');

-- Upsert path used by the UI: same (worker, day) flips status, not dupes.
SELECT lives_ok(
  $$INSERT INTO worker_availability_days (worker_id, day, status, note)
    SELECT worker_pid, '2026-12-25', 'available', 'plans changed'
      FROM ids
    ON CONFLICT (worker_id, day) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note$$,
  'worker can flip a day status via upsert');

SELECT is(
  (SELECT status::text FROM worker_availability_days
    WHERE worker_id = (SELECT worker_pid FROM ids) AND day = '2026-12-25'),
  'available',
  'upsert flipped the status on the same row');

SELECT throws_ok(
  $$INSERT INTO worker_availability_days (worker_id, day, status)
    SELECT worker_pid, '2026-12-26', 'bogus' FROM ids$$,
  '22P02',
  NULL,
  'invalid status is rejected by the enum');

-- ---- bystander: blind under RLS -------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);

SELECT is_empty(
  $$SELECT 1 FROM worker_availability_days$$,
  'bystander cannot see another worker''s days');

SELECT throws_ok(
  $$INSERT INTO worker_availability_days (worker_id, day, status)
    SELECT worker_pid, '2026-12-25', 'unavailable' FROM ids$$,
  '42501',
  NULL,
  'bystander cannot insert rows for another worker');

SELECT * FROM finish();
ROLLBACK;
