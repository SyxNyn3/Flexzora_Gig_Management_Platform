-- Regression: issue #28 — an IOU larger than the 25% cap used to EXIT the
-- settle loop, freezing every IOU behind it forever. Now it settles
-- partially, the queue continues, and the remainder rides the next payout.
-- Uses the seed fixtures (Demo Productions, worker1). Runs as the migration
-- owner so guards bypass; auth.uid() is pointed at the company user because
-- approve_timesheet verifies the caller owns the company.
BEGIN;
SELECT plan(14);

SELECT set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- fixtures: two ENDED shifts on the demo event, worker1 confirmed + clocked on both
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage)
VALUES
  ('aaaa0028-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000003', 'Call A', 'Stagehand', 1,
   now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 50.00, 'open', 'public'),
  ('aaaa0028-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000003', 'Call B', 'Stagehand', 1,
   now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 50.00, 'open', 'public');

INSERT INTO shift_assignments (id, shift_id, worker_id, status, source)
SELECT 'bbbb0028-0000-4000-8000-000000000001', 'aaaa0028-0000-4000-8000-000000000001', p.id, 'confirmed', 'public_marketplace'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source)
SELECT 'bbbb0028-0000-4000-8000-000000000002', 'aaaa0028-0000-4000-8000-000000000002', p.id, 'confirmed', 'public_marketplace'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';

INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, status)
SELECT 'cccc0028-0000-4000-8000-000000000001', 'bbbb0028-0000-4000-8000-000000000001', 'aaaa0028-0000-4000-8000-000000000001', p.id,
       now() - interval '2 days', now() - interval '2 days' + interval '8 hours', 'submitted'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';
INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, status)
SELECT 'cccc0028-0000-4000-8000-000000000002', 'bbbb0028-0000-4000-8000-000000000002', 'aaaa0028-0000-4000-8000-000000000002', p.id,
       now() - interval '1 day', now() - interval '1 day' + interval '8 hours', 'submitted'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';

INSERT INTO escrow_deposits (event_id, company_id, amount, status, funded_at)
VALUES ('22222222-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 5000.00, 'funded', now());

-- debts on Call A: a $150 IOU (over the $100 cap on $400 gross) created
-- first, then a $20 IOU behind it
INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary, created_at)
SELECT 'dddd0028-0000-4000-8000-000000000001', p.id, 'aaaa0028-0000-4000-8000-000000000001', 'lodging', 15000, 'Host', now() - interval '3 hours'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';
INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary, created_at)
SELECT 'dddd0028-0000-4000-8000-000000000002', p.id, 'aaaa0028-0000-4000-8000-000000000001', 'food', 2000, 'Runner', now() - interval '2 hours'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';

-- ---- payout 1: Call A, gross 8h x $50 = $400, cap $100 ---------------------
SELECT lives_ok($$ SELECT approve_timesheet('cccc0028-0000-4000-8000-000000000001') $$, 'approve Call A');

SELECT is((SELECT settled_cents FROM crew_iou WHERE id = 'dddd0028-0000-4000-8000-000000000001'), 10000,
  '#28 over-cap IOU settles PARTIALLY up to the cap (10000 of 15000)');
SELECT is((SELECT status::text FROM crew_iou WHERE id = 'dddd0028-0000-4000-8000-000000000001'), 'committed',
  '#28 partially settled IOU stays committed');
SELECT is((SELECT settled_cents FROM crew_iou WHERE id = 'dddd0028-0000-4000-8000-000000000002'), 0,
  'IOU behind an exhausted cap is untouched (older debt never jumped)');
SELECT is((SELECT total FROM invoices WHERE timesheet_id = 'cccc0028-0000-4000-8000-000000000001'), 300.00::numeric,
  'net payout = 400 - 100 deducted');
SELECT is((SELECT count(*)::int FROM crew_iou_settlements WHERE timesheet_id = 'cccc0028-0000-4000-8000-000000000001'), 1,
  'one settlement ledger row for payout 1');
SELECT ok((SELECT line_items::text LIKE '%partial: 100.00 of 150.00%' FROM invoices WHERE timesheet_id = 'cccc0028-0000-4000-8000-000000000001'),
  'invoice line itemises the partial collection');

-- ---- payout 2: Call B — remainder carries over, then the small IOU --------
SELECT lives_ok($$ SELECT approve_timesheet('cccc0028-0000-4000-8000-000000000002') $$, 'approve Call B');

SELECT is((SELECT status::text FROM crew_iou WHERE id = 'dddd0028-0000-4000-8000-000000000001'), 'settled',
  '#28 remainder survives to the next payout and completes');
SELECT is((SELECT settled_cents FROM crew_iou WHERE id = 'dddd0028-0000-4000-8000-000000000001'), 15000,
  'big IOU fully collected after two payouts');
SELECT is((SELECT status::text FROM crew_iou WHERE id = 'dddd0028-0000-4000-8000-000000000002'), 'settled',
  '#28 the IOU that used to be deadlocked behind it now settles too');
SELECT is((SELECT total FROM invoices WHERE timesheet_id = 'cccc0028-0000-4000-8000-000000000002'), 330.00::numeric,
  'net payout 2 = 400 - (50 carry + 20) = 330');
SELECT is((SELECT count(*)::int FROM crew_iou_settlements WHERE timesheet_id = 'cccc0028-0000-4000-8000-000000000002' AND carried_over), 2,
  'both payout-2 collections are flagged carried_over');
SELECT is((SELECT sum(amount_cents)::int FROM crew_iou_settlements WHERE iou_id = 'dddd0028-0000-4000-8000-000000000001'), 15000,
  'settlement ledger sums to the original debt');

SELECT * FROM finish();
ROLLBACK;
