-- Lane B: IOU beneficiary transfer. approve_timesheet settles committed IOUs
-- out of the debtor's payout (25% cap) AND queues an 'iou_transfer' payout per
-- beneficiary so the deducted cents leave escrow to the person owed.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'iou-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000c0a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'iou-debtor@test.local', 'x', '{"full_name":"Debtor","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000c0a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'iou-driver@test.local', 'x', '{"full_name":"Driver","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000c0a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'iou-host@test.local', 'x', '{"full_name":"Host","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0f1', 'IOUCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000c0d1', '00000000-0000-0000-0000-00000000c0f1', 'Depot', '2 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status, overtime_rule_code) VALUES
  ('00000000-0000-0000-0000-00000000c0e1', '00000000-0000-0000-0000-00000000c0f1', '00000000-0000-0000-0000-00000000c0d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a1'), 'Load', current_date - 2, current_date - 1, 'completed', 'US_FLSA');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000c0f2', '00000000-0000-0000-0000-00000000c0e1', 'Deck', 'Stagehand', 1,
   now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 40, 'open');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at)
SELECT '00000000-0000-0000-0000-00000000c0a5', '00000000-0000-0000-0000-00000000c0f2', id, 'direct_book', 'confirmed', now()
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a2';

-- 8h @ $40 → gross 320; IOU cap = 25% = $80. IOU1 ($50, driver) settles fully;
-- IOU2 ($100, host) takes the remaining $30 and stays committed.
INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, break_minutes, status)
SELECT '00000000-0000-0000-0000-00000000c0d2', '00000000-0000-0000-0000-00000000c0a5', '00000000-0000-0000-0000-00000000c0f2', id,
       now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 0, 'submitted'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a2';

INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, settle_via, notes) VALUES
  ('00000000-0000-0000-0000-00000000c0b1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a2'),
   '00000000-0000-0000-0000-00000000c0f2', 'ride', 5000,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a3'), 'payout_deduction', 'gas share'),
  ('00000000-0000-0000-0000-00000000c0b2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a2'),
   '00000000-0000-0000-0000-00000000c0f2', 'lodging', 10000,
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a4'), 'payout_deduction', 'room share');

INSERT INTO escrow_deposits (event_id, amount, status)
VALUES ('00000000-0000-0000-0000-00000000c0e1', 1000, 'funded');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c0a1","role":"authenticated"}', true);

SELECT ok(approve_timesheet('00000000-0000-0000-0000-00000000c0d2') IS NOT NULL, 'approval succeeds');

-- worker nets gross − $80 (the capped $80 of $150 owed)
SELECT is(
  (SELECT amount FROM payouts WHERE invoice_id IN
    (SELECT id FROM invoices WHERE timesheet_id = '00000000-0000-0000-0000-00000000c0d2')
    AND kind = 'timesheet'),
  240::numeric, 'debtor payout is net of the capped deduction');

-- each beneficiary gets a queued iou_transfer payout for what was collected
SELECT results_eq(
  $$ SELECT p.worker_id::text, p.amount::numeric, p.kind, p.crew_iou_id IS NOT NULL
     FROM payouts p WHERE p.kind = 'iou_transfer' ORDER BY p.amount DESC $$,
  $$ VALUES ((SELECT id::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a3'), 50::numeric, 'iou_transfer'::text, true),
            ((SELECT id::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000c0a4'), 30::numeric, 'iou_transfer'::text, true) $$,
  'transfer payouts queue to the beneficiaries for the collected cents');

-- IOU1 fully settled; IOU2 partially (cap exhausted) and stays committed
SELECT results_eq(
  $$ SELECT id::text, status::text, settled_cents FROM crew_iou ORDER BY created_at, id $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000c0b1'::text, 'settled'::text, 5000),
            ('00000000-0000-0000-0000-00000000c0b2'::text, 'committed'::text, 3000) $$,
  'oldest IOU settles; the next absorbs only the cap that is left');

SELECT results_eq(
  $$ SELECT iou_id::text, amount_cents FROM crew_iou_settlements ORDER BY amount_cents DESC $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000c0b1'::text, 5000),
            ('00000000-0000-0000-0000-00000000c0b2'::text, 3000) $$,
  'settlement ledger records each collection');

SELECT is(
  (SELECT total FROM invoices WHERE timesheet_id = '00000000-0000-0000-0000-00000000c0d2'),
  240::numeric, 'invoice total is the net');

SELECT is(
  (SELECT released_amount FROM escrow_deposits WHERE event_id = '00000000-0000-0000-0000-00000000c0e1'),
  320::numeric, 'the whole gross leaves escrow (net + deductions fund the transfers)');

SELECT * FROM finish();
ROLLBACK;
