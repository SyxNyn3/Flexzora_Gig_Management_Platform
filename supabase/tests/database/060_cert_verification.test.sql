-- Lane B #1: cert verification workflow.
-- Worker submits doc → pending; related company reviews; outsiders can't;
-- review fields never move via direct client writes.
BEGIN;
SELECT plan(11);

-- ============================================================================
-- fixtures: two companies + two workers (one related via roster, one not)
-- ============================================================================
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-owner2@test.local', 'x', '{"full_name":"Owner Two","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-worker@test.local', 'x', '{"full_name":"Worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cv-rogue@test.local', 'x', '{"full_name":"Rogue"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0b1', 'ReviewCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b011';
INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0b2', 'OtherCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b012';

-- worker is on ReviewCo's roster (the relationship that grants review rights)
INSERT INTO preferred_rosters (company_id, worker_id, tier)
SELECT '00000000-0000-0000-0000-00000000c0b1', id, 'preferred'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b013';

-- one pending cert + one already-verified cert (verified set as service role)
INSERT INTO certifications (id, worker_id, name, cert_type_code, verification_status,
                            verification_requested_at, document_path)
SELECT '00000000-0000-0000-0000-00000000ce01', id, 'OSHA-30', 'OSHA_30', 'pending',
       now() - interval '3 days', 'x/doc.pdf'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b013';
INSERT INTO certifications (id, worker_id, name, verified, verified_at, verification_status)
SELECT '00000000-0000-0000-0000-00000000ce02', id, 'Forklift', true, now(), 'verified'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b013';
INSERT INTO certifications (id, worker_id, name, verification_status, review_note)
SELECT '00000000-0000-0000-0000-00000000ce03', id, 'Rigging', 'rejected', 'blurry scan'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b013';

-- ============================================================================
-- 1. worker cannot self-stamp any review field
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b013","role":"authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE certifications SET verified = true WHERE id = '00000000-0000-0000-0000-00000000ce01' $$,
  'P0001', NULL, 'worker cannot set verified');

SELECT throws_ok(
  $$ UPDATE certifications SET reviewed_by = worker_id WHERE id = '00000000-0000-0000-0000-00000000ce01' $$,
  'P0001', NULL, 'worker cannot set reviewed_by');

SELECT throws_ok(
  $$ UPDATE certifications SET verification_status = 'verified' WHERE id = '00000000-0000-0000-0000-00000000ce01' $$,
  'P0001', NULL, 'worker cannot jump to verified status');

SELECT throws_ok(
  $$ UPDATE certifications SET document_path = 'x/new.pdf' WHERE id = '00000000-0000-0000-0000-00000000ce02' $$,
  'P0001', NULL, 'document locked on a verified credential');

-- ============================================================================
-- 2. review rights require a real company-worker relationship
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b012","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT review_certification('00000000-0000-0000-0000-00000000ce01',
                                 '00000000-0000-0000-0000-00000000c0b2', true) $$,
  'P0001', NULL, 'unrelated company cannot review');

SELECT is(
  (SELECT count(*)::int FROM pending_cert_reviews('00000000-0000-0000-0000-00000000c0b2')),
  0, 'OtherCo queue is empty');

-- ============================================================================
-- 3. reject needs a note; approve stamps verified + notifies
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b011","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT review_certification('00000000-0000-0000-0000-00000000ce01',
                                 '00000000-0000-0000-0000-00000000c0b1', false) $$,
  'P0001', NULL, 'rejection requires a note');

SELECT lives_ok(
  $$ SELECT review_certification('00000000-0000-0000-0000-00000000ce01',
                                 '00000000-0000-0000-0000-00000000c0b1', true, 'docs check out') $$,
  'related company approves');

SELECT is(
  (SELECT verified AND verification_status = 'verified' AND verified_at IS NOT NULL
          AND reviewed_by IS NOT NULL
     FROM certifications WHERE id = '00000000-0000-0000-0000-00000000ce01'),
  true, 'approve stamps verified + review fields');

SELECT is(
  (SELECT count(*)::int FROM notifications
    WHERE user_id = (SELECT worker_id FROM certifications WHERE id = '00000000-0000-0000-0000-00000000ce01')),
  1, 'worker got the decision notification');

-- ============================================================================
-- 4. a rejected cert can resubmit (status only flips pending-side)
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b013","role":"authenticated"}', true);

SELECT lives_ok(
  $$ UPDATE certifications SET verification_status = 'pending'
       WHERE id = '00000000-0000-0000-0000-00000000ce03' $$,
  'rejected credential can resubmit');

SELECT * FROM finish();
ROLLBACK;
