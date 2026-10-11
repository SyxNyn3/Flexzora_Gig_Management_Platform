-- Lane B #6: compliance vault. Workers can't self-stamp review fields;
-- unrelated companies can't review; the payout claim refuses a worker with no
-- approved W-9.
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b052', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-owner2@test.local', 'x', '{"full_name":"Owner Two","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b053', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-w1@test.local', 'x', '{"full_name":"W1","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b054', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-w2@test.local', 'x', '{"full_name":"W2","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0aa', 'VaultCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b051';
INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0ab', 'OtherCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b052';

INSERT INTO preferred_rosters (company_id, worker_id, tier)
SELECT '00000000-0000-0000-0000-00000000c0aa', id, 'preferred' FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b053';

INSERT INTO compliance_docs (id, worker_id, doc_type, document_path, status)
SELECT '00000000-0000-0000-0000-00000000cd01', id, 'w9', 'x/w9.pdf', 'pending'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b053';

-- payouts: w1 has a queued payout (approved after review below); w2 too — but
-- w2 never files a W-9, so his claim must stay held
INSERT INTO invoices (id, worker_id, company_id, subtotal, total, status)
VALUES
  ('00000000-0000-0000-0000-00000000de01',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b053'),
   '00000000-0000-0000-0000-00000000c0aa', 500.00, 500.00, 'issued'),
  ('00000000-0000-0000-0000-00000000de02',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b054'),
   '00000000-0000-0000-0000-00000000c0aa', 300.00, 300.00, 'issued');
INSERT INTO payouts (id, invoice_id, worker_id, amount, status)
VALUES
  ('00000000-0000-0000-0000-00000000df01', '00000000-0000-0000-0000-00000000de01',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b053'), 500.00, 'queued'),
  ('00000000-0000-0000-0000-00000000df02', '00000000-0000-0000-0000-00000000de02',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b054'), 300.00, 'queued');

-- ============================================================================
-- 1. workers cannot self-stamp review state
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b053","role":"authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE compliance_docs SET status = 'approved' WHERE id = '00000000-0000-0000-0000-00000000cd01' $$,
  'P0001', NULL, 'worker cannot approve own document');

SELECT throws_ok(
  $$ UPDATE compliance_docs SET reviewed_by = worker_id WHERE id = '00000000-0000-0000-0000-00000000cd01' $$,
  'P0001', NULL, 'worker cannot stamp reviewed_by');

-- ============================================================================
-- 2. review rights require the company-worker relationship
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b052","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT review_compliance_doc('00000000-0000-0000-0000-00000000cd01',
                                  '00000000-0000-0000-0000-00000000c0ab', true) $$,
  'P0001', NULL, 'unrelated company cannot review');

-- ============================================================================
-- 3. owner reviews: reject needs a note; approve stamps + notifies
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b051","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT review_compliance_doc('00000000-0000-0000-0000-00000000cd01',
                                  '00000000-0000-0000-0000-00000000c0aa', false) $$,
  'P0001', NULL, 'rejection requires a note');

SELECT lives_ok(
  $$ SELECT review_compliance_doc('00000000-0000-0000-0000-00000000cd01',
                                  '00000000-0000-0000-0000-00000000c0aa', true) $$,
  'related company approves the W-9');

SELECT is(
  (SELECT count(*)::int FROM notifications n JOIN profiles p ON p.id = n.user_id
    WHERE p.user_id = '00000000-0000-0000-0000-00000000b053' AND n.title = 'W9 approved'),
  1, 'worker got the approval notification');

-- ============================================================================
-- 4. the payout gate
-- ============================================================================
RESET ROLE;

SELECT throws_ok(
  $$ SELECT claim_payout_for_release('00000000-0000-0000-0000-00000000df02') $$,
  'P0001', NULL, 'no approved W-9 → payout claim is held');

SELECT is(
  (SELECT status::text FROM claim_payout_for_release('00000000-0000-0000-0000-00000000df01')),
  'processing', 'approved W-9 → payout claims normally');

-- ============================================================================
-- 5. pre-stamp dodge: an API-side INSERT cannot land an already-'approved'
--    doc (that would bypass the W-9 payout hold)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b053","role":"authenticated"}', true);

SELECT lives_ok(
  $$ INSERT INTO compliance_docs (worker_id, doc_type, document_path, status, reviewed_by, reviewed_at)
     SELECT p.id, 'i9', p.id::text || '/i9/sneaky.pdf', 'approved', p.id, now()
     FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b053' $$,
  'worker can file a doc — pre-stamped review fields are stripped');

SELECT is(
  (SELECT status FROM compliance_docs d JOIN profiles p ON p.id = d.worker_id
    WHERE p.user_id = '00000000-0000-0000-0000-00000000b053' AND d.doc_type = 'i9'),
  'pending', 'insert-time status is forced to pending');

SELECT * FROM finish();
ROLLBACK;
