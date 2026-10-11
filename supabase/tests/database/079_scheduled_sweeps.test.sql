-- Lane B: scheduled sweeps. release_stale_roster_broadcasts promotes open shifts
-- whose roster-only window expired, run_company_sweeps orchestrates release +
-- every company-scoped generator, and the whole thing hangs on a pg_cron job.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sw-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0fd', 'SweepCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0b1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d042', '00000000-0000-0000-0000-00000000c0fd', 'Lot', '2 Main', 37.8, -122.4);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0f2', '00000000-0000-0000-0000-00000000c0fd', '00000000-0000-0000-0000-00000000d042',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0b1'), 'Next show', current_date + 5, current_date + 6, 'published');

-- f801: roster window expired 6h ago → releases; f802: broadcast 1h ago → holds
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate,
                    status, broadcast_stage, roster_broadcast_at) VALUES
  ('00000000-0000-0000-0000-00000000f801', '00000000-0000-0000-0000-00000000e0f2', 'Stale hold', 'Stagehand', 1,
   now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 40, 'open', 'roster', now() - interval '30 hours'),
  ('00000000-0000-0000-0000-00000000f802', '00000000-0000-0000-0000-00000000e0f2', 'Fresh hold', 'Stagehand', 1,
   now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 40, 'open', 'roster', now() - interval '1 hour');

-- 1: the sweep releases exactly the stale shift
SELECT is(release_stale_roster_broadcasts(), 1, 'release returns the count of promoted shifts');

-- 2: stale shift went public with a timestamp
SELECT results_eq(
  $$ SELECT broadcast_stage, public_broadcast_at IS NOT NULL FROM shifts WHERE id = '00000000-0000-0000-0000-00000000f801' $$,
  $$ VALUES ('public'::text, true) $$,
  'expired roster hold flips to public');

-- 3: fresh hold untouched
SELECT is(
  (SELECT broadcast_stage FROM shifts WHERE id = '00000000-0000-0000-0000-00000000f802'),
  'roster'::text, 'shift still inside the window stays roster-only');

-- 4: orchestrator runs the release + all per-company generators cleanly
SELECT lives_ok(
  $$ SELECT run_company_sweeps() $$,
  'run_company_sweeps executes every generator without error');

-- 5: the job is actually scheduled
SELECT ok(
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'company-sweeps'),
  'pg_cron job company-sweeps is scheduled');

SELECT * FROM finish();
ROLLBACK;
