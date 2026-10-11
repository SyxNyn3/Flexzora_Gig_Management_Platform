-- Lane B: swap sweeteners minted as payout_deduction carry over to the
-- requester's next approved timesheet (once the swapped shift has ended) and
-- pay the claimer via an iou_transfer payout.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sw-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sw-requester@test.local', 'x', '{"full_name":"Requester","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000d0a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sw-claimer@test.local', 'x', '{"full_name":"Claimer","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000d0f1', 'SwapCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d0d1', '00000000-0000-0000-0000-00000000d0f1', 'Lot', '3 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status, overtime_rule_code) VALUES
  ('00000000-0000-0000-0000-00000000d0e1', '00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a1'), 'Swap week', current_date - 3, current_date - 1, 'completed', 'US_FLSA');

-- the swapped-out shift (ended) and the requester's next call (also ended)
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000d0f2', '00000000-0000-0000-0000-00000000d0e1', 'Swapped call', 'Stagehand', 1,
   now() - interval '3 days', now() - interval '3 days' + interval '8 hours', 40, 'completed'),
  ('00000000-0000-0000-0000-00000000d0f3', '00000000-0000-0000-0000-00000000d0e1', 'Next call', 'Stagehand', 1,
   now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 40, 'open');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000d0a5', '00000000-0000-0000-0000-00000000d0f3', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a2';

INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, break_minutes, status)
SELECT '00000000-0000-0000-0000-00000000d0d2', '00000000-0000-0000-0000-00000000d0a5', '00000000-0000-0000-0000-00000000d0f3', id,
       now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 0, 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a2';

-- the completed swap's sweetener ($60, payout_deduction, anchored on the ended
-- swapped shift) + a control manual IOU that must NOT settle
INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, settle_via, notes) VALUES
  ('00000000-0000-0000-0000-00000000d0b1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a2'),
   '00000000-0000-0000-0000-00000000d0f2', 'other', 6000,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a3'), 'payout_deduction', 'Shift swap sweetener'),
  ('00000000-0000-0000-0000-00000000d0b2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a2'),
   '00000000-0000-0000-0000-00000000d0f2', 'other', 1000,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d0a3'), 'manual', 'off-platform promise');

INSERT INTO escrow_deposits (event_id, amount, status)
VALUES ('00000000-0000-0000-0000-00000000d0e1', 1000, 'funded');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d0a1","role":"authenticated"}', true);

SELECT lives_ok($$ SELECT approve_timesheet('00000000-0000-0000-0000-00000000d0d2') $$, 'approval succeeds');

SELECT is(
  (SELECT status::text FROM crew_iou WHERE id = '00000000-0000-0000-0000-00000000d0b1'),
  'settled', 'the sweetener carries over and settles ($60 under the $80 cap)');

SELECT is(
  (SELECT status::text FROM crew_iou WHERE id = '00000000-0000-0000-0000-00000000d0b2'),
  'committed', 'manual IOUs are never collected by the deduction loop');

SELECT is(
  (SELECT amount FROM payouts WHERE kind = 'iou_transfer' AND crew_iou_id = '00000000-0000-0000-0000-00000000d0b1'),
  60::numeric, 'a transfer payout queues the $60 to the claimer');

SELECT is(
  (SELECT amount FROM payouts WHERE kind = 'timesheet' AND invoice_id IN
    (SELECT id FROM invoices WHERE timesheet_id = '00000000-0000-0000-0000-00000000d0d2')),
  260::numeric, 'the requester nets 320 − 60');

SELECT * FROM finish();
ROLLBACK;
