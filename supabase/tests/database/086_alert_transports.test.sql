-- Lane B: SmartAlerts transports. alert_preferences is self-managed; the SMS
-- digest sweep no-ops unconfigured, then batches only sms-enabled, aged,
-- phone-having workers' alerts when the fn_url flag is set.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'al-w1@test.local', 'x', '{"full_name":"One","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000e0a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'al-w2@test.local', 'x', '{"full_name":"Two","role":"worker"}'::jsonb, now(), now());

UPDATE profiles SET phone = '+15550001111' WHERE user_id = '00000000-0000-0000-0000-00000000e0a1';

-- w1: sms on for iou only (push default). w2: sms on iou but no phone.
INSERT INTO alert_preferences (worker_id, kind, sms) VALUES
  ((SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a1'), 'iou', true),
  ((SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a2'), 'iou', true);

-- a1: iou, 1h ago, w1 → digestable. a2: gear, w1, sms off → skip.
-- a3: iou, 5min ago, w1 → too fresh. a4: iou, 1h ago, w2 → no phone.
INSERT INTO crew_alerts (id, worker_id, kind, title, body, created_at) VALUES
  ('00000000-0000-0000-0000-00000000e0b1', (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a1'), 'iou', 'IOU settled', 'a1', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000e0b2', (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a1'), 'gear', 'Gear list', 'a2', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000e0b3', (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a1'), 'iou', 'IOU settled', 'a3', now() - interval '5 minutes'),
  ('00000000-0000-0000-0000-00000000e0b4', (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a2'), 'iou', 'IOU settled', 'a4', now() - interval '1 hour');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}', true);

-- 1: workers cannot write another worker's prefs
SELECT throws_ok(
  $$ INSERT INTO alert_preferences (worker_id, kind, sms)
     VALUES ((SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a2'), 'gear', true) $$,
  '42501', NULL, 'prefs are self-managed');

-- 2: own prefs upsert fine
SELECT lives_ok(
  $$ INSERT INTO alert_preferences (worker_id, kind, push, sms)
     VALUES ((SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e0a1'), 'gear', true, false)
     ON CONFLICT (worker_id, kind) DO UPDATE SET sms = EXCLUDED.sms $$,
  'worker manages their own prefs');

RESET ROLE;

-- 3: digest no-ops while the fn_url flag is unset — nothing marked
SELECT set_config('app.sms_digest_fn_url', '', false);
SELECT is(send_alert_sms_digests(), 0, 'digest returns 0 unconfigured');
SELECT is(
  (SELECT count(*) FROM crew_alerts WHERE sms_sent_at IS NOT NULL),
  0::bigint, 'unconfigured digest marks nothing');

-- 4: configured → only a1 collected (enabled kind + aged + has phone)
SELECT set_config('app.sms_digest_fn_url', 'https://fn.test/alert-digest', false);
SELECT set_config('app.push_internal_secret', 's3cret', false);
SELECT is(send_alert_sms_digests(), 1, 'one worker batch dispatched');

SELECT results_eq(
  $$ SELECT id::text FROM crew_alerts WHERE sms_sent_at IS NOT NULL ORDER BY id $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000e0b1'::text) $$,
  'only the sms-enabled aged alert with a phone is marked sent');

SELECT * FROM finish();
ROLLBACK;
