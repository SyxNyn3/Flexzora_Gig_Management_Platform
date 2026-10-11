-- Regression: issue #51 — the debtor could void (or settle) their own
-- auto-minted IOU with a direct table write, erasing a debt they owed. Only the
-- beneficiary can forgive, and only before collection has started. Bails and
-- cancels still void through their definer cascades (explicit seat release).
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b511', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'debtor51@test.local', 'x', '{"full_name":"Debtor"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b512', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'creditor51@test.local', 'x', '{"full_name":"Creditor"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c510', 'Void Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b511';

INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e510', '00000000-0000-0000-0000-00000000c510', 'Void show', '2027-03-01', '2027-03-02');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d510', '00000000-0000-0000-0000-00000000e510',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open');

-- I1: untouched debt.  I2: debt that has already started collecting.
INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, status, settle_via, iou_group_id, notes)
SELECT '00000000-0000-0000-0000-00000000f510', d.id, '00000000-0000-0000-0000-00000000d510', 'food'::crew_iou_kind, 1200, c.id,
       'committed'::crew_iou_status, 'payout_deduction'::crew_iou_settle_via, '00000000-0000-0000-0000-00000000f511', 'Burrito run'
FROM profiles d, profiles c
WHERE d.user_id = '00000000-0000-0000-0000-00000000b511' AND c.user_id = '00000000-0000-0000-0000-00000000b512';
INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, status, settle_via, settled_cents, iou_group_id, notes)
SELECT '00000000-0000-0000-0000-00000000f512', d.id, '00000000-0000-0000-0000-00000000d510', 'food'::crew_iou_kind, 1000, c.id,
       'committed'::crew_iou_status, 'payout_deduction'::crew_iou_settle_via, 400, '00000000-0000-0000-0000-00000000f513', 'Half-collected'
FROM profiles d, profiles c
WHERE d.user_id = '00000000-0000-0000-0000-00000000b511' AND c.user_id = '00000000-0000-0000-0000-00000000b512';

SET LOCAL ROLE authenticated;

-- the debtor cannot void their own debt
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b511","role":"authenticated"}', true);
SELECT throws_ok($$
  UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-00000000f510'
$$, 'P0001', NULL, 'debtor cannot void their own IOU');

-- nor mark it settled
SELECT throws_ok($$
  UPDATE crew_iou SET status = 'settled', settled_at = now() WHERE id = '00000000-0000-0000-0000-00000000f510'
$$, 'P0001', NULL, 'debtor cannot mark their own IOU settled');

-- nor shrink it
SELECT throws_ok($$
  UPDATE crew_iou SET amount_cents = 1 WHERE id = '00000000-0000-0000-0000-00000000f510'
$$, 'P0001', NULL, 'debtor cannot rewrite the amount');

-- the beneficiary cannot forgive a debt that is already being collected
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b512","role":"authenticated"}', true);
SELECT throws_ok($$
  UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-00000000f512'
$$, 'P0001', NULL, 'partially collected IOU cannot be forgiven');

-- the beneficiary can forgive an untouched debt (consent to void)
SELECT lives_ok($$
  UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-00000000f510'
$$, 'beneficiary forgives an untouched IOU');

RESET ROLE;
SELECT is((SELECT status::text FROM crew_iou WHERE id = '00000000-0000-0000-0000-00000000f510'), 'void',
          'the forgiven IOU is void');
SELECT is((SELECT status::text FROM crew_iou WHERE id = '00000000-0000-0000-0000-00000000f512'), 'committed',
          'the partially collected IOU stays committed');

SELECT * FROM finish();
ROLLBACK;
