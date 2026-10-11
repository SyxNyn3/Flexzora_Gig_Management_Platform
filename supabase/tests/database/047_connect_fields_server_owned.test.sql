-- Regression: #47 — worker_sensitive Connect fields were self-writable, so a
-- worker could point stripe_connect_account_id at an account they control.
-- #24 — claim_payout_for_release must hand the row to exactly one caller.
BEGIN;
SELECT plan(9);

-- fixtures (seed: company user, worker1, worker2). Invoice + payout are
-- inserted as the migration owner (RLS bypassed), the rest through API role.
INSERT INTO invoices (id, worker_id, company_id, subtotal, total, line_items)
SELECT '99990047-0000-4000-8000-000000000001', p.id, '22222222-0000-4000-8000-000000000001', 100, 100, '[]'::jsonb
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';
INSERT INTO payouts (id, invoice_id, worker_id, amount, status)
SELECT '99990024-0000-4000-8000-000000000001', '99990047-0000-4000-8000-000000000001', p.id, 100.00, 'queued'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';

SELECT set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- worker can still save their private location
SELECT lives_ok($$
  INSERT INTO worker_sensitive (worker_id, latitude, longitude)
  SELECT p.id, 30.0, -87.0 FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002'
$$, 'worker can still save private location');

-- self-insert of a Connect account is rejected
SELECT throws_ok($$
  INSERT INTO worker_sensitive (worker_id, stripe_connect_account_id, payouts_enabled)
  SELECT p.id, 'acct_attacker', true FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000003'
$$, '42501', NULL, '#47 self-insert of a Connect account is rejected');

-- self-write of payouts_enabled / account on an existing row is rejected
SELECT throws_ok($$
  UPDATE worker_sensitive SET payouts_enabled = true, stripe_connect_account_id = 'acct_attacker'
  WHERE worker_id = (SELECT id FROM profiles WHERE user_id = '11111111-0000-4000-8000-000000000002')
$$, '42501', NULL, '#47 self-write of stripe_connect_account_id / payouts_enabled is rejected');

-- ---- #24: atomic claim, exercised as the service role --------------------
RESET ROLE;

SELECT is((SELECT count(*)::int FROM claim_payout_for_release('99990024-0000-4000-8000-000000000001')), 1,
  '#24 first caller claims the queued payout');
SELECT is((SELECT status::text FROM payouts WHERE id = '99990024-0000-4000-8000-000000000001'), 'processing',
  '#24 claimed row is processing');
SELECT is((SELECT count(*)::int FROM claim_payout_for_release('99990024-0000-4000-8000-000000000001')), 0,
  '#24 a concurrent second claim gets zero rows (no double transfer)');

UPDATE payouts SET status = 'paid' WHERE id = '99990024-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::int FROM claim_payout_for_release('99990024-0000-4000-8000-000000000001')), 0,
  '#24 a paid payout cannot be re-claimed');

-- the service-role write path (connect-onboard) still works
INSERT INTO worker_sensitive (worker_id, stripe_connect_account_id, payouts_enabled)
SELECT p.id, 'acct_real', true FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000003'
ON CONFLICT (worker_id) DO UPDATE SET stripe_connect_account_id = 'acct_real', payouts_enabled = true;
SELECT is((SELECT stripe_connect_account_id FROM worker_sensitive ws JOIN profiles p ON p.id = ws.worker_id
           WHERE p.user_id = '11111111-0000-4000-8000-000000000003'), 'acct_real',
  'server-side (service) write of Connect state still works');

-- API roles cannot call the claim function directly
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT * FROM claim_payout_for_release('99990024-0000-4000-8000-000000000001') $$,
  '42501', NULL, '#24 claim function is not callable by API roles');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
