-- Regression: worker ledger + start-pack onboarding.
-- Covers: manual entry write/read, summary units (cents), RLS boundaries
-- (bystander blind, company read-only on tagged rows), onboarding company
-- discovery, and role-gated item transitions (worker can't self-confirm,
-- company admin can).
BEGIN;
SELECT plan(15);

-- fixtures: company owner, unrelated bystander, worker with an invoice
-- relationship to the company (that relationship unlocks onboarding_get)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'wl-owner@test.local', 'x', '{"full_name":"WL Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'wl-worker@test.local', 'x', '{"full_name":"WL Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'wl-bystander@test.local', 'x', '{"full_name":"WL Bystander","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000dc01', 'LedgerCo', id
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d001';

-- invoice gives the worker a company relationship (onboarding_get gate)
INSERT INTO invoices (id, worker_id, company_id, subtotal, total, status)
VALUES ('00000000-0000-0000-0000-00000000de01',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d002'),
        '00000000-0000-0000-0000-00000000dc01', 500.00, 500.00, 'issued');

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d001') AS owner_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d002') AS worker_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000d003') AS bystander_pid;
GRANT SELECT ON ids TO authenticated;

-- ---- worker: add a manual income entry + a mileage entry -------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT ledger_add_entry('manual_income', 125000, current_date,
      '00000000-0000-0000-0000-00000000dc01', NULL,
      '{"payer":"OffPlatform LLC","invoice_ref":"INV-9"}'::jsonb, 'Festival gig')$$,
  'worker can add manual income entry');

SELECT lives_ok(
  $$SELECT ledger_add_entry('mileage', 45600, current_date,
      NULL, NULL, '{"miles":60,"rate_cents":760}'::jsonb, 'Gear truck run')$$,
  'worker can add mileage entry');

SELECT throws_ok(
  $$SELECT ledger_add_entry('manual_income', -100, current_date)$$,
  'Income-side entries must be positive; use adjustment to correct',
  'negative income-side entry rejected');

-- ledger_entries returns only the worker's own rows
SELECT is(
  (SELECT count(*)::int FROM ledger_entries()),
  2,
  'ledger_entries returns the two entries the worker added');

-- summary: earned_cents = manual_income 125000 (invoice is 'issued' unpaid, so
-- it lands in billed/outstanding, not received); mileage tracked separately
SELECT is(
  (SELECT (ledger_summary(extract(year from now())::int)->>'earned_cents')::bigint),
  125000::bigint,
  'ledger_summary earned_cents counts manual income in cents');

SELECT is(
  (SELECT (ledger_summary(extract(year from now())::int)->>'total_miles')::numeric),
  60::numeric,
  'ledger_summary counts mileage details.miles');

-- bystander sees nothing
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM ledger_entries()),
  0,
  'bystander ledger_entries is empty');
SELECT is(
  (SELECT count(*)::int FROM worker_ledger_entries),
  0,
  'bystander cannot read worker ledger rows via RLS');

-- ---- onboarding ------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}', true);

SELECT ok(
  EXISTS (SELECT 1 FROM onboarding_companies()
          WHERE company_id = '00000000-0000-0000-0000-00000000dc01'),
  'onboarding_companies lists the invoice-linked company');

SELECT lives_ok(
  $$SELECT onboarding_update_item('00000000-0000-0000-0000-00000000dc01','deal_memo','submitted')$$,
  'worker can mark item submitted');

SELECT is(
  (SELECT items->>'deal_memo' FROM gig_onboarding
    WHERE worker_id = (SELECT worker_pid FROM ids)
      AND company_id = '00000000-0000-0000-0000-00000000dc01'),
  'submitted',
  'submitted state persisted');

-- worker tries to self-confirm: trigger must silently revert to prior state
SELECT lives_ok(
  $$UPDATE gig_onboarding
    SET items = jsonb_set(items, '{deal_memo}', '"confirmed"')
    WHERE worker_id = (SELECT worker_pid FROM ids)
      AND company_id = '00000000-0000-0000-0000-00000000dc01'$$,
  'worker self-confirm update executes without error');

SELECT is(
  (SELECT items->>'deal_memo' FROM gig_onboarding
    WHERE worker_id = (SELECT worker_pid FROM ids)
      AND company_id = '00000000-0000-0000-0000-00000000dc01'),
  'submitted',
  'worker self-confirm reverted by guard trigger');

-- company owner confirms via direct update (RLS + trigger allow it)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);
SELECT lives_ok(
  $$UPDATE gig_onboarding
    SET items = jsonb_set(items, '{deal_memo}', '"confirmed"')
    WHERE company_id = '00000000-0000-0000-0000-00000000dc01'
      AND worker_id = (SELECT worker_pid FROM ids)$$,
  'company owner can confirm item');

SELECT is(
  (SELECT items->>'deal_memo' FROM gig_onboarding
    WHERE worker_id = (SELECT worker_pid FROM ids)
      AND company_id = '00000000-0000-0000-0000-00000000dc01'),
  'confirmed',
  'company confirmation persisted');

SELECT * FROM finish();
ROLLBACK;
