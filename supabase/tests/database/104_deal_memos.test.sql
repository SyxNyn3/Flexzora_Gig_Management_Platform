-- Regression: deal memos — digital offer memos with e-signature.
-- Covers: company-only send gate, confirmed-only requirement, frozen terms
-- snapshot + immutability trigger, worker-only one-shot signature, void rules,
-- RLS boundaries (bystander blind), and direct-write denial.
BEGIN;
SELECT plan(15);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dm-owner@test.local', 'x', '{"full_name":"DM Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dm-worker@test.local', 'x', '{"full_name":"DM Worker","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dm-bystander@test.local', 'x', '{"full_name":"DM Bystander","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000fc01', 'Memo Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f101';

INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000fe01', '00000000-0000-0000-0000-00000000fc01', 'Memo show', '2027-04-01', '2027-04-02');

-- Two confirmed bookings (memo 1 signs, memo 2 voids) + one still 'offered'.
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fe01',
        'Call A', 'Stagehand', 2, '2027-04-01 08:00+00', '2027-04-01 16:00+00', 30.00, 'filled');

INSERT INTO shift_assignments (id, shift_id, worker_id, status, source, offered_rate)
SELECT '00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fd01', p.id, 'confirmed', 'direct_book', 35.00
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000f102';
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source, offered_rate)
SELECT '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000fd01', p.id, 'offered', 'direct_book', 30.00
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000f103';

CREATE TEMP TABLE memo_ids (memo1 uuid, memo2 uuid) ON COMMIT DROP;
-- Authenticated-role assertions read memo_ids — temp tables need a per-role grant.
GRANT SELECT ON memo_ids TO authenticated;

-- ---- send gates ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT deal_memo_send('00000000-0000-0000-0000-00000000fa01')$$,
  'only the hiring company can send a deal memo');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f103","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT deal_memo_send('00000000-0000-0000-0000-00000000fa01')$$,
  'only the hiring company can send a deal memo');

-- worker's own assignment is 'confirmed' but sender isn't company -> still denied above.
-- bystander has an 'offered' assignment: even the company can't memo unconfirmed work.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT deal_memo_send('00000000-0000-0000-0000-00000000fa02')$$,
  'assignment is offered — deal memos require a confirmed booking');

SELECT lives_ok(
  $$SELECT deal_memo_send('00000000-0000-0000-0000-00000000fa01', 'Call 7am sharp')$$,
  'company sends memo for confirmed assignment');

RESET ROLE;

-- capture the memo id for later assertions (queried as superuser so RLS
-- doesn't hide it from the test harness)
INSERT INTO memo_ids SELECT id, NULL FROM deal_memos LIMIT 1;

-- duplicate send must fail (one memo per assignment)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT deal_memo_send('00000000-0000-0000-0000-00000000fa01')$$,
  'a deal memo already exists for this assignment');

-- ---- visibility ------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM deal_memos), 1,
  'worker sees own memo');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f103","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM deal_memos), 0,
  'bystander sees no memos');

-- ---- signature -------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT deal_memo_sign((SELECT memo1 FROM memo_ids), 'X')$$,
  'typed full legal name is required');

SELECT lives_ok(
  $$SELECT deal_memo_sign((SELECT memo1 FROM memo_ids), 'DM Worker', NULL)$$,
  'worker signs with typed name');

SELECT throws_ok(
  $$SELECT deal_memo_sign((SELECT memo1 FROM memo_ids), 'DM Worker Again')$$,
  'memo is signed — only sent memos can be signed');

-- ---- immutability + void ----------------------------------------------------
RESET ROLE;
SELECT throws_ok(
  $$UPDATE deal_memos SET terms = '{"hourly_rate":1}'::jsonb WHERE id = (SELECT memo1 FROM memo_ids)$$,
  'Deal memo terms and parties are immutable');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT deal_memo_void((SELECT memo1 FROM memo_ids))$$,
  'memo is signed — only unsent-signed memos can be voided');

RESET ROLE;
-- second confirmed assignment for the void path — needs its own shift:
-- shift_assignments is UNIQUE(shift_id, worker_id) and f103 already holds
-- the 'offered' fa02 row on fd01.
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fe01',
        'Call B', 'Stagehand', 1, '2027-04-01 18:00+00', '2027-04-02 02:00+00', 32.00, 'filled');
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source, offered_rate)
SELECT '00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-00000000fd02', p.id, 'confirmed', 'direct_book', 32.00
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000f103';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT deal_memo_send('00000000-0000-0000-0000-00000000fa03')$$,
  'company sends second memo');

-- Capture memo2 as superuser: the void assertion below resolves the id
-- through memo_ids instead of an RLS-scoped subquery, keeping the test
-- deterministic regardless of read-policy visibility timing.
RESET ROLE;
UPDATE memo_ids SET memo2 = (SELECT id FROM deal_memos WHERE assignment_id = '00000000-0000-0000-0000-00000000fa03');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT deal_memo_void((SELECT memo2 FROM memo_ids))$$,
  'company voids an unsigned memo');

-- direct table write must be denied (no grants)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO deal_memos (assignment_id, shift_id, event_id, worker_id, company_id, terms, sent_by)
    VALUES ('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000fd01',
            '00000000-0000-0000-0000-00000000fe01',
            (SELECT id FROM profiles WHERE user_id='00000000-0000-0000-0000-00000000f102'),
            '00000000-0000-0000-0000-00000000fc01','{}',
            (SELECT id FROM profiles WHERE user_id='00000000-0000-0000-0000-00000000f101'))$$,
  'permission denied for table deal_memos');

SELECT * FROM finish();
ROLLBACK;
