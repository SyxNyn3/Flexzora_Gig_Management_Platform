-- Lane B: GrubRun v2 — runner handoff, minimum orders, late-cancel fee.
BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gv-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gv-runner@test.local', 'x', '{"full_name":"Runner","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gv-orderer@test.local', 'x', '{"full_name":"Orderer","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0f4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gv-target@test.local', 'x', '{"full_name":"Target","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b0f5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gv-latecancel@test.local', 'x', '{"full_name":"LateCancel","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c1bb', 'GrubCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d046', '00000000-0000-0000-0000-00000000c1bb', 'Dock', '6 Main', 37.8, -122.4);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0f6', '00000000-0000-0000-0000-00000000c1bb', '00000000-0000-0000-0000-00000000d046',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f1'), 'Show', current_date + 4, current_date + 4, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000e0f6', 'Call', 'Stagehand', 4,
   now() + interval '4 days', now() + interval '4 days' + interval '8 hours', 40, 'open');

-- both workers confirmed crew (handoff eligibility)
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000ac01'::uuid, '00000000-0000-0000-0000-00000000fc01'::uuid, id, 'direct_book'::assignment_source, 'confirmed'::assignment_status, now() FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f3'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-00000000ac02'::uuid, '00000000-0000-0000-0000-00000000fc01'::uuid, id, 'direct_book'::assignment_source, 'confirmed'::assignment_status, now() FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f4'::uuid;

-- R1: min_orders=2; R2: late_fee=500, cutoff moves past mid-test
INSERT INTO food_runs (id, shift_id, runner_worker_id, restaurant, order_cutoff_at, min_orders, late_fee_cents)
SELECT '00000000-0000-0000-0000-000000009c01'::uuid, '00000000-0000-0000-0000-00000000fc01'::uuid, id, 'Tacos', now() + interval '3 days', 2, 0 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f2'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-000000009c02'::uuid, '00000000-0000-0000-0000-00000000fc01'::uuid, id, 'Pizza', now() + interval '3 days', 0, 500 FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f2'::uuid;

INSERT INTO food_run_orders (id, run_id, worker_id, item, status)
SELECT '00000000-0000-0000-0000-000000009c11'::uuid, '00000000-0000-0000-0000-000000009c01'::uuid, id, '2 carnitas', 'placed'::food_order_status FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f3'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-000000009c12'::uuid, '00000000-0000-0000-0000-000000009c02'::uuid, id, 'Slice', 'placed'::food_order_status FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f3'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-000000009c13'::uuid, '00000000-0000-0000-0000-000000009c02'::uuid, id, 'Pie', 'placed'::food_order_status FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f4'::uuid
UNION ALL
SELECT '00000000-0000-0000-0000-000000009c15'::uuid, '00000000-0000-0000-0000-000000009c02'::uuid, id, 'Nachos', 'placed'::food_order_status FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f5'::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0f2","role":"authenticated"}', true);

-- 1: 'ordered' below min_orders raises
SELECT throws_ok(
  $$ UPDATE food_runs SET status = 'ordered' WHERE id = '00000000-0000-0000-0000-000000009c01' $$,
  'P0001', 'Run needs 1 more order(s) before committing',
  'runner cannot commit below the order minimum');

-- 2: once the second order lands the transition succeeds
RESET ROLE;
INSERT INTO food_run_orders (id, run_id, worker_id, item, status)
SELECT '00000000-0000-0000-0000-000000009c14', '00000000-0000-0000-0000-000000009c01', id, 'Horchata', 'placed' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f4';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0f2","role":"authenticated"}', true);
SELECT lives_ok(
  $$ UPDATE food_runs SET status = 'ordered' WHERE id = '00000000-0000-0000-0000-000000009c01' $$,
  'runner commits once the minimum is met');

-- 3/4: runner confirms W2's order on R2 (mints IOU to runner), then offers handoff
-- confirm at $12 — under the auto-accept cap, so consent is stamped (the mint
-- only fires once price_accepted_at is set, per the #52 price lock)
UPDATE food_run_orders SET status = 'confirmed', price_cents = 1200 WHERE id = '00000000-0000-0000-0000-000000009c13';
UPDATE food_run_orders SET status = 'confirmed', price_cents = 900 WHERE id = '00000000-0000-0000-0000-000000009c12';
RESET ROLE;
SELECT ok(
  offer_run_handoff('00000000-0000-0000-0000-000000009c02', (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f4')),
  'handoff offered to a confirmed crew member');
RESET ROLE;
SELECT ok(
  EXISTS (SELECT 1 FROM notifications n JOIN profiles p ON p.id = n.user_id
          WHERE p.user_id = '00000000-0000-0000-0000-00000000b0f4' AND n.title = 'Food run handoff'),
  'handoff target is notified');

-- 5/6: target accepts — runner moves and the committed order IOU re-points
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0f4","role":"authenticated"}', true);
SELECT ok(accept_run_handoff('00000000-0000-0000-0000-000000009c02'), 'target accepts the handoff');
SELECT is(
  (SELECT beneficiary_worker_id FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-000000009c12'),
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f4'),
  'committed order IOU re-points to the new runner');

-- 7: runner retracts a second offer → pending clears
SELECT ok(offer_run_handoff('00000000-0000-0000-0000-000000009c02', (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f3')), 're-offer works');
SELECT decline_run_handoff('00000000-0000-0000-0000-000000009c02');
SELECT ok(NOT EXISTS (
         SELECT 1 FROM food_runs WHERE id = '00000000-0000-0000-0000-000000009c02' AND pending_runner_worker_id IS NOT NULL),
  'runner can retract the handoff offer');

-- 8/9: orderer cancels their placed order AFTER the cutoff → fee IOU + alert
RESET ROLE;
UPDATE food_runs SET order_cutoff_at = now() - interval '1 hour' WHERE id = '00000000-0000-0000-0000-000000009c02';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0f5","role":"authenticated"}', true);
UPDATE food_run_orders SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-000000009c15';
SELECT results_eq(
  $$ SELECT amount_cents, beneficiary_worker_id FROM crew_iou
      WHERE iou_group_id = '00000000-0000-0000-0000-000000009c15' AND notes LIKE 'Late cancel%' $$,
  $$ SELECT 500, (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f4') $$,
  'late cancel mints the fee to the current runner');
RESET ROLE;
SELECT ok(
  EXISTS (SELECT 1 FROM crew_alerts WHERE dedupe_key = 'latecancel:food:00000000-0000-0000-0000-000000009c15'),
  'runner gets the late-cancel alert');

-- 10: offer to someone not confirmed on the shift → rejected
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0f4","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT offer_run_handoff('00000000-0000-0000-0000-000000009c02',
       (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b0f1')) $$,
  'P0001', 'Handoff target must be confirmed crew on this shift',
  'handoff target must be confirmed crew');

SELECT * FROM finish();
ROLLBACK;
