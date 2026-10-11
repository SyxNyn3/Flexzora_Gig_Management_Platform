-- Lane B #4: standby pools. On-call crew outrank even core on backfill, and a
-- posted standby_rate is stamped on the auto-offer.
BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sb-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b032', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sb-w1@test.local', 'x', '{"full_name":"W1","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b033', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sb-w2@test.local', 'x', '{"full_name":"W2","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b034', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sb-w3@test.local', 'x', '{"full_name":"W3","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0e1', 'StandbyCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b031';

INSERT INTO venues (id, company_id, name, address, latitude, longitude)
VALUES ('00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000c0e1', 'Club', '2 Side St', 40.0, -74.0);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status)
SELECT '00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-00000000c0e1',
       '00000000-0000-0000-0000-00000000d0f1', id, 'StandbyGig', current_date - 1, current_date + 1, 'published'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b031';

-- w2 is the on-call pick at $55; w3 is ordinary core
INSERT INTO preferred_rosters (company_id, worker_id, tier, standby_rate)
SELECT '00000000-0000-0000-0000-00000000c0e1', id, 'standby', 55.00 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b033'
UNION ALL
SELECT '00000000-0000-0000-0000-00000000c0e1', id, 'core', NULL FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b034';

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000e0a1',
        'Door call', 'Security', 1, now() - interval '1 hours', now() + interval '5 hours', 40.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000a201', '00000000-0000-0000-0000-00000000f201', id,
       'roster_broadcast', 'confirmed', now() - interval '1 day'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b032';

UPDATE shift_assignments SET status = 'declined' WHERE id = '00000000-0000-0000-0000-00000000a201';

SELECT is(
  (SELECT a.worker_id FROM shift_assignments a
    WHERE a.shift_id = '00000000-0000-0000-0000-00000000f201' AND a.status = 'offered'),
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b033'),
  'standby crew outranks core on backfill');

SELECT is(
  (SELECT offered_rate FROM shift_assignments
    WHERE shift_id = '00000000-0000-0000-0000-00000000f201' AND status = 'offered'),
  55.00::numeric, 'standby rate is stamped on the offer');

SELECT is(
  (SELECT count(*)::int FROM notifications n JOIN profiles p ON p.id = n.user_id
    WHERE p.user_id = '00000000-0000-0000-0000-00000000b033' AND n.message LIKE '%Standby rate $55%'),
  1, 'offer message carries the standby rate');

SELECT is(
  (SELECT count(*)::int FROM shift_assignments a JOIN profiles p ON p.id = a.worker_id
    WHERE a.shift_id = '00000000-0000-0000-0000-00000000f201' AND p.user_id = '00000000-0000-0000-0000-00000000b034'),
  0, 'core member waits behind the on-call pool');

SELECT * FROM finish();
ROLLBACK;
