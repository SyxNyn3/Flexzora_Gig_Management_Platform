-- Red-team #51: system-minted IOUs (iou_group_id set) can't be voided by the
-- debtor alone — void needs the beneficiary's consent through the RPCs.
-- Self-created IOUs still void directly.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000050a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vc-debtor@test.local', 'x', '{"full_name":"Debtor","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000050a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vc-driver@test.local', 'x', '{"full_name":"Driver","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000050a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vc-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000050f1', 'VoidCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000050a3';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000050d1', '00000000-0000-0000-0000-0000000050f1', 'Lot', '9 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000050e1', '00000000-0000-0000-0000-0000000050f1', '00000000-0000-0000-0000-0000000050d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000050a3'), 'Hang', current_date + 2, current_date + 2, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000050f2', '00000000-0000-0000-0000-0000000050e1', 'Deck', 'Stagehand', 2,
   now() + interval '2 days', now() + interval '2 days' + interval '8 hours', 40, 'open');

INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, settle_via, iou_group_id) VALUES
  ('00000000-0000-0000-0000-0000000050b1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000050a1'),
   '00000000-0000-0000-0000-0000000050f2', 'ride', 3000,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000050a2'), 'payout_deduction', '00000000-0000-0000-0000-0000000050c1'),
  ('00000000-0000-0000-0000-0000000050b2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000050a1'),
   '00000000-0000-0000-0000-0000000050f2', 'food', 1200,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000050a2'), 'manual', NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a1","role":"authenticated"}', true);

-- 1: the verified exploit — debtor silently voids a ride-match IOU
SELECT throws_ok(
  $$ UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-0000000050b1' $$,
  '42501', NULL, 'debtor cannot void a system-minted IOU');

-- 2: request → flag set + beneficiary alerted
SELECT ok(request_iou_void('00000000-0000-0000-0000-0000000050b1') IS NOT NULL, 'void request lands');
SELECT is(
  (SELECT count(*) FROM crew_alerts WHERE ref_id = '00000000-0000-0000-0000-0000000050b1' AND title = 'Void requested'),
  1::bigint, 'beneficiary was asked to consent');

-- 3: the debtor cannot consent on the beneficiary's behalf
SELECT throws_ok(
  $$ SELECT consent_iou_void('00000000-0000-0000-0000-0000000050b1') $$,
  '42501', NULL, 'consent belongs to the beneficiary');

-- 4: deny path — flag clears, stays committed
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000050a2","role":"authenticated"}', true);
SELECT ok(deny_iou_void('00000000-0000-0000-0000-0000000050b1') IS NOT NULL, 'beneficiary denies');
SELECT is(
  (SELECT status::text FROM crew_iou WHERE id = '00000000-0000-0000-0000-0000000050b1'),
  'committed', 'denied IOU stays committed');

SELECT * FROM finish();
ROLLBACK;
