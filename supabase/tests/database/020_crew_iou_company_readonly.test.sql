-- Regression: issue #20 — crew_iou was company-writable on shift-anchored rows
-- (beneficiary, amount and status could all be rewritten by the hiring company).
-- Companies are now read-only; shift cancellation still voids through its
-- SECURITY DEFINER trigger.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner20@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'debtor20@test.local', 'x', '{"full_name":"Debtor"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'creditor20@test.local', 'x', '{"full_name":"Creditor"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b204', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'outsider20@test.local', 'x', '{"full_name":"Outsider"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c200', 'Readonly Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b201';

INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e200', '00000000-0000-0000-0000-00000000c200', 'Readonly show', '2027-03-01', '2027-03-02');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d200', '00000000-0000-0000-0000-00000000e200',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open');

INSERT INTO crew_iou (id, worker_id, shift_id, kind, amount_cents, beneficiary_worker_id, status, settle_via, iou_group_id, notes)
SELECT '00000000-0000-0000-0000-00000000f200', d.id, '00000000-0000-0000-0000-00000000d200', 'ride'::crew_iou_kind, 1000, c.id,
       'committed'::crew_iou_status, 'payout_deduction'::crew_iou_settle_via, '00000000-0000-0000-0000-00000000f201', 'Gas share'
FROM profiles d, profiles c
WHERE d.user_id = '00000000-0000-0000-0000-00000000b202' AND c.user_id = '00000000-0000-0000-0000-00000000b203';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b201","role":"authenticated"}', true);

-- the hiring company cannot rewrite the amount
SELECT throws_ok($$
  UPDATE crew_iou SET amount_cents = 1 WHERE id = '00000000-0000-0000-0000-00000000f200'
$$, 'P0001', NULL, 'company cannot change the amount of a payout deduction');

-- nor redirect the debt to someone else
SELECT throws_ok($$
  UPDATE crew_iou SET beneficiary_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b204')
  WHERE id = '00000000-0000-0000-0000-00000000f200'
$$, 'P0001', NULL, 'company cannot redirect the beneficiary');

-- nor void or settle it
SELECT throws_ok($$
  UPDATE crew_iou SET status = 'void' WHERE id = '00000000-0000-0000-0000-00000000f200'
$$, 'P0001', NULL, 'company cannot void a crew IOU');
SELECT throws_ok($$
  UPDATE crew_iou SET status = 'settled', settle_via = 'manual' WHERE id = '00000000-0000-0000-0000-00000000f200'
$$, 'P0001', NULL, 'company cannot mark a crew IOU settled');

-- the shift-cancel path is definer-driven and still voids the committed IOU
SELECT lives_ok($$
  UPDATE shifts SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-00000000d200'
$$, 'company cancels the shift');

RESET ROLE;
SELECT is((SELECT status::text FROM crew_iou WHERE id = '00000000-0000-0000-0000-00000000f200'), 'void',
          'shift cancellation voids the IOU through the definer path');

SELECT * FROM finish();
ROLLBACK;
