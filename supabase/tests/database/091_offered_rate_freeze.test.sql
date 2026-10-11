-- Red-team #23: offered_rate locks once the worker commits — the company
-- could rewrite it post-confirmation and silently change the paycheck.
-- Negotiation while pending stays open for both sides.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rf-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000040a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rf-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000040a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rf-worker2@test.local', 'x', '{"full_name":"WorkerTwo","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000040f1', 'RateCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000040a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000040d1', '00000000-0000-0000-0000-0000000040f1', 'Field', '8 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000040e1', '00000000-0000-0000-0000-0000000040f1', '00000000-0000-0000-0000-0000000040d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000040a1'), 'Fest', current_date + 6, current_date + 6, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000040f2', '00000000-0000-0000-0000-0000000040e1', 'Lights', 'LX', 2,
   now() + interval '6 days', now() + interval '6 days' + interval '8 hours', 40, 'open');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, offered_rate, confirmed_at) VALUES
  ('00000000-0000-0000-0000-0000000040a3', '00000000-0000-0000-0000-0000000040f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000040a2'), 'direct_book', 'confirmed', 55, now()),
  ('00000000-0000-0000-0000-0000000040a4', '00000000-0000-0000-0000-0000000040f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000040a5'), 'public_marketplace', 'offered', 45, NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a1","role":"authenticated"}', true);

-- the verified exploit: company cuts the rate after the worker confirmed
SELECT throws_ok(
  $$ UPDATE shift_assignments SET offered_rate = 20 WHERE id = '00000000-0000-0000-0000-0000000040a3' $$,
  '42501', NULL, 'company cannot rewrite the rate on a confirmed booking');

SELECT throws_ok(
  $$ UPDATE shift_assignments SET match_score = 99 WHERE id = '00000000-0000-0000-0000-0000000040a3' $$,
  '42501', NULL, 'match fields lock with the rate');

-- negotiation is still open pre-commit
SELECT lives_ok(
  $$ UPDATE shift_assignments SET offered_rate = 48 WHERE id = '00000000-0000-0000-0000-0000000040a4' $$,
  'company can still adjust the rate while the offer is pending');

-- legitimate company status moves unaffected
SELECT lives_ok(
  $$ UPDATE shift_assignments SET status = 'rejected' WHERE id = '00000000-0000-0000-0000-0000000040a4' $$,
  'company can still reject a pending offer');

-- the worker withdraws cleanly — status moves are untouched
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040a2","role":"authenticated"}', true);
SELECT lives_ok(
  $$ UPDATE shift_assignments SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-0000000040a3' $$,
  'worker withdraw still works');

SELECT * FROM finish();
ROLLBACK;
