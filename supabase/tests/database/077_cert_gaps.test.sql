-- Lane B: "what unlocks more calls" hints. worker_cert_gaps counts upcoming
-- shifts the worker could see (same pool as the marketplace) that are gated
-- on credentials they lack — with a state label (missing/pending/rejected/
-- expired/unsubmitted) so the hint reads right.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cg-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b092', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cg-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0ec', 'GapCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b091';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d031', '00000000-0000-0000-0000-00000000c0ec', 'Arena', '1 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0e1', '00000000-0000-0000-0000-00000000c0ec', '00000000-0000-0000-0000-00000000d031',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b091'), 'Expo', current_date + 10, current_date + 10, 'published');

-- public open calls: two FORKLIFT-gated, one ETCP_ARENA-gated, one OSHA_30-gated (cleared),
-- one FALL_PROTECT roster-stage call the worker can't see yet
INSERT INTO shifts (id, event_id, title, role_name, skill_id, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, required_cert_codes) VALUES
  ('00000000-0000-0000-0000-00000000f601', '00000000-0000-0000-0000-00000000e0e1', 'Dock A', 'Stagehand', NULL, 2, now() + interval '10 days', now() + interval '10 days' + interval '8 hours', 40, 'open', 'public', '{FORKLIFT}'),
  ('00000000-0000-0000-0000-00000000f602', '00000000-0000-0000-0000-00000000e0e1', 'Dock B', 'Stagehand', NULL, 2, now() + interval '10 days', now() + interval '10 days' + interval '8 hours', 40, 'open', 'public', '{FORKLIFT}'),
  ('00000000-0000-0000-0000-00000000f603', '00000000-0000-0000-0000-00000000e0e1', 'Steel', 'Ground Rigger', NULL, 1, now() + interval '10 days', now() + interval '10 days' + interval '8 hours', 55, 'open', 'public', '{ETCP_ARENA}'),
  ('00000000-0000-0000-0000-00000000f604', '00000000-0000-0000-0000-00000000e0e1', 'Safety', 'Stagehand', NULL, 1, now() + interval '10 days', now() + interval '10 days' + interval '8 hours', 38, 'open', 'public', '{OSHA_30}'),
  ('00000000-0000-0000-0000-00000000f605', '00000000-0000-0000-0000-00000000e0e1', 'Heights', 'Ground Rigger', NULL, 1, now() + interval '10 days', now() + interval '10 days' + interval '8 hours', 52, 'open', 'roster', '{FALL_PROTECT}'),
  -- past/filled call never counts even when gated
  ('00000000-0000-0000-0000-00000000f606', '00000000-0000-0000-0000-00000000e0e1', 'Old', 'Stagehand', NULL, 1, now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 40, 'open', 'public', '{CPR_FIRST_AID}');

-- worker: OSHA_30 verified (clears f604), ETCP_ARENA pending review
INSERT INTO certifications (worker_id, name, cert_type_code, is_active, verified, verification_status)
SELECT id, 'OSHA 30', 'OSHA_30', true, true, 'verified' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b092'
UNION ALL
SELECT id, 'ETCP Arena', 'ETCP_ARENA', true, false, 'pending' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b092';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b092","role":"authenticated"}', true);

-- 1: FORKLIFT tops the list (2 calls) — verified OSHA_30 never appears
SELECT is(
  (SELECT cert_type_code FROM worker_cert_gaps_for_current_user() ORDER BY demand_count DESC, cert_type_code LIMIT 1),
  'FORKLIFT', 'the most-demanded missing credential leads the hints');

SELECT results_eq(
  $$ SELECT cert_type_code, demand_count::int, state FROM worker_cert_gaps_for_current_user() ORDER BY demand_count DESC, cert_type_code $$,
  $$ VALUES ('FORKLIFT', 2, 'missing'), ('ETCP_ARENA', 1, 'pending') $$,
  'gated calls aggregate per credential with the right state label');

SELECT is(
  (SELECT count(*) FROM worker_cert_gaps_for_current_user() WHERE cert_type_code = 'CPR_FIRST_AID')::int,
  0, 'past calls never count toward the hint');

SELECT is(
  (SELECT count(*) FROM worker_cert_gaps_for_current_user() WHERE cert_type_code = 'FALL_PROTECT')::int,
  0, 'roster-stage calls stay hidden until the worker joins that roster');

-- 2: join the roster (company-managed — fixture runs outside RLS) → the
-- FALL_PROTECT gap appears
RESET ROLE;
INSERT INTO preferred_rosters (company_id, worker_id, tier)
SELECT '00000000-0000-0000-0000-00000000c0ec', id, 'core' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b092';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b092","role":"authenticated"}', true);

SELECT is(
  (SELECT demand_count::int FROM worker_cert_gaps_for_current_user() WHERE cert_type_code = 'FALL_PROTECT'),
  1, 'roster membership makes its gated calls visible to the hint');

SELECT * FROM finish();
ROLLBACK;
