-- Red-team #50 + #48: oracle functions answer only for shared parties;
-- alert dedupe keys are worker-scoped and worker self-inserts are gone.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000063a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'or-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000063a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'or-roster@test.local', 'x', '{"full_name":"Roster","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000063a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'or-stranger@test.local', 'x', '{"full_name":"Stranger","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000063f1', 'OrCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a1';

-- roster member shares via preferred_rosters; stranger shares nothing
INSERT INTO preferred_rosters (company_id, worker_id, tier)
SELECT '00000000-0000-0000-0000-0000000063f1', id, 'core' FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2';

-- both workers publish home geo
INSERT INTO worker_sensitive (worker_id, latitude, longitude)
SELECT id, 34.05, -118.24 FROM profiles WHERE user_id IN
  ('00000000-0000-0000-0000-0000000063a2', '00000000-0000-0000-0000-0000000063a3');

SET LOCAL ROLE authenticated;

-- #50: the company sees its roster member but not the stranger
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a1","role":"authenticated"}', true);
SELECT is(
  (SELECT distance_km IS NOT NULL FROM worker_distances(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2')]::uuid[], 34.0, -118.2)),
  true, 'roster member distance resolves (#50)');
SELECT ok(
  (SELECT distance_km FROM worker_distances(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3')]::uuid[], 34.0, -118.2)) IS NULL,
  'stranger distance is masked');
SELECT ok(
  (SELECT hard_conflict FROM worker_conflicts(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3')]::uuid[],
     now(), now() + interval '8 hours')) IS NULL,
  'stranger conflicts are masked too');

-- the worker always sees themselves (self-checks / availability preview)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000063a3","role":"authenticated"}', true);
SELECT is(
  (SELECT distance_km IS NOT NULL FROM worker_distances(
     ARRAY[(SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3')]::uuid[], 34.0, -118.2)),
  true, 'self distance still resolves');

-- #48: workers can no longer self-insert alerts at all
SELECT throws_ok(
  $$ INSERT INTO crew_alerts (worker_id, kind, title, body, dedupe_key)
     VALUES ((SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3'),
             'custom', 'x', 'x', 'alert:ride-cancelled:victim') $$,
  '42501', NULL, 'worker self-insert of alerts is gone (#48)');

-- ...and anything the system writes is namespaced to the target worker
RESET ROLE;
INSERT INTO crew_alerts (worker_id, kind, title, body, dedupe_key)
SELECT id, 'custom', 't', 'b', 'shared-key' FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2';
INSERT INTO crew_alerts (worker_id, kind, title, body, dedupe_key)
SELECT id, 'custom', 't', 'b', 'shared-key' FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a3';

SELECT is(
  (SELECT dedupe_key FROM crew_alerts
    WHERE worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2')),
  (SELECT id::text || ':shared-key' FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000063a2'),
  'dedupe keys land in the worker keyspace');
SELECT ok(
  (SELECT count(*) FROM crew_alerts WHERE dedupe_key LIKE '%:shared-key') = 2,
  'the same logical key can coexist across workers');

SELECT * FROM finish();
ROLLBACK;
