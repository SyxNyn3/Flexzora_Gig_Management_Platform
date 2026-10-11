-- Red-team #20: company can no longer rewrite IOU money terms (verified
-- exploit); the worker branch is frozen on the same terms so a debtor can't
-- inflate settled_cents to dodge the deduction. Definer internals unaffected.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000030a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'im-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000030a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'im-debtor@test.local', 'x', '{"full_name":"Debtor","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000030a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'im-friend@test.local', 'x', '{"full_name":"Friend","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000030f1', 'ImmutCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000030d1', '00000000-0000-0000-0000-0000000030f1', 'Yard', '7 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000030e1', '00000000-0000-0000-0000-0000000030f1', '00000000-0000-0000-0000-0000000030d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a1'), 'Gig', current_date + 4, current_date + 4, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000030f2', '00000000-0000-0000-0000-0000000030e1', 'Audio', 'A1', 1,
   now() + interval '4 days', now() + interval '4 days' + interval '8 hours', 50, 'open');

INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, settle_via, notes) VALUES
  ('00000000-0000-0000-0000-0000000030b1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a2'),
   '00000000-0000-0000-0000-0000000030f2', 'ride', 4000,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a3'), 'payout_deduction', 'gas');

SET LOCAL ROLE authenticated;

-- company branch: every money term + settlement field is immutable
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000030a1","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE crew_iou SET beneficiary_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a2')
     WHERE id = '00000000-0000-0000-0000-0000000030b1' $$,
  '42501', NULL, 'company cannot re-aim the beneficiary (the verified exploit)');

SELECT throws_ok(
  $$ UPDATE crew_iou SET amount_cents = 1 WHERE id = '00000000-0000-0000-0000-0000000030b1' $$,
  '42501', NULL, 'company cannot shrink the amount');

SELECT throws_ok(
  $$ UPDATE crew_iou SET status = 'settled' WHERE id = '00000000-0000-0000-0000-0000000030b1' $$,
  '42501', NULL, 'company cannot self-settle a payout-deduction IOU');

-- company keeps only committed → void (moderation)
SELECT lives_ok(
  $$ UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-0000000030b1' $$,
  'company may still void a committed IOU');

-- worker branch: debtor cannot inflate settled_cents to skip the deduction
RESET ROLE;
INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, settle_via) VALUES
  ('00000000-0000-0000-0000-0000000030b2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a2'),
   '00000000-0000-0000-0000-0000000030f2', 'food', 2500,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000030a3'), 'payout_deduction');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000030a2","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE crew_iou SET settled_cents = 2500 WHERE id = '00000000-0000-0000-0000-0000000030b2' $$,
  NULL, NULL, 'debtor cannot fake partial settlement');

-- worker void still works
SELECT lives_ok(
  $$ UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-0000000030b2' $$,
  'debtor can still void');

SELECT * FROM finish();
ROLLBACK;
