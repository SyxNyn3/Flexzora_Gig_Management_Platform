-- Regression: issues #49, #43, #38, #37, #44 — the P0-RT HIGH batch.
-- Runs under `supabase test db` (pgTAP). Simulates the API role by switching
-- to `authenticated` with a request.jwt.claims sub, exactly as PostgREST does.
BEGIN;
SELECT plan(13);

-- ============================================================================
-- fixtures: owner + two workers + an outsider
-- ============================================================================
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker1@test.local', 'x', '{"full_name":"Worker One"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker2@test.local', 'x', '{"full_name":"Worker Two"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'outsider@test.local', 'x', '{"full_name":"Outsider"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0a1', 'ActiveCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b001';
INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0a2', 'EmptyCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b001';

INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-00000000c0a1', 'Show', '2027-01-01', '2027-01-02');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000e0a1',
        'Load-in', 'Stagehand', 2, '2027-01-01 08:00+00', '2027-01-01 16:00+00', 30.00, 'open');

INSERT INTO shift_assignments (shift_id, worker_id, status, source)
SELECT '00000000-0000-0000-0000-00000000d0a1', id, 'confirmed', 'public_marketplace'
  FROM profiles WHERE user_id IN ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b003');

INSERT INTO gigs (id, title, description, created_by, location, start_date, end_date)
SELECT '00000000-0000-0000-0000-0000000000a1', 'Legacy gig', 'x', id, 'Venue', '2027-02-01', '2027-02-02'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b001';

INSERT INTO gig_applications (id, gig_id, worker_id, status)
SELECT '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-0000000000a1', id, 'pending'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b002';
INSERT INTO gig_applications (id, gig_id, worker_id, status)
SELECT '00000000-0000-0000-0000-00000000f0a2', '00000000-0000-0000-0000-0000000000a1', id, 'pending'
  FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b003';

-- ============================================================================
-- #49 — company DELETE with event history is blocked
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', true);

SELECT throws_ok(
  $$ DELETE FROM companies WHERE id = '00000000-0000-0000-0000-00000000c0a1' $$,
  '42501', NULL, '#49 company with event history cannot be deleted');

SELECT lives_ok(
  $$ DELETE FROM companies WHERE id = '00000000-0000-0000-0000-00000000c0a2' $$,
  '#49 empty company can still be deleted');

-- ============================================================================
-- #43 — shift terms freeze once crew is confirmed
-- ============================================================================
SELECT throws_ok(
  $$ UPDATE shifts SET hourly_rate = 5.00 WHERE id = '00000000-0000-0000-0000-00000000d0a1' $$,
  '42501', NULL, '#43 owner cannot rewrite rate after confirmations');

SELECT throws_ok(
  $$ UPDATE shifts SET headcount = 1 WHERE id = '00000000-0000-0000-0000-00000000d0a1' $$,
  '42501', NULL, '#43 headcount cannot drop below confirmed staffing');

SELECT lives_ok(
  $$ UPDATE shifts SET notes = 'gate B' WHERE id = '00000000-0000-0000-0000-00000000d0a1' $$,
  '#43 notes/status fields stay editable');

-- ============================================================================
-- #38 — worker cannot self-accept an application
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}', true);

SELECT throws_ok(
  $$ UPDATE gig_applications SET status = 'accepted' WHERE id = '00000000-0000-0000-0000-00000000f0a1' $$,
  '42501', NULL, '#38 worker cannot self-accept application');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}', true);

SELECT lives_ok(
  $$ UPDATE gig_applications SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-00000000f0a2' $$,
  '#38 worker can still withdraw');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', true);

SELECT lives_ok(
  $$ UPDATE gig_applications SET status = 'accepted' WHERE id = '00000000-0000-0000-0000-00000000f0a1' $$,
  '#38 gig owner can accept');

-- ============================================================================
-- #37 — reviews need a real shared gig and distinct parties
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO reviews (gig_id, reviewer_id, reviewee_id, rating)
     SELECT '00000000-0000-0000-0000-0000000000a1', id, id, 5
       FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b002' $$,
  '42501', NULL, '#37 self-review rejected');

SELECT throws_ok(
  $$ INSERT INTO reviews (gig_id, reviewer_id, reviewee_id, rating)
     SELECT NULL, w.id, o.id, 5
       FROM profiles w, profiles o
      WHERE w.user_id = '00000000-0000-0000-0000-00000000b002'
        AND o.user_id = '00000000-0000-0000-0000-00000000b001' $$,
  '42501', NULL, '#37 review without a gig rejected (closes bombing loop)');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b004","role":"authenticated"}', true);

SELECT throws_ok(
  $$ INSERT INTO reviews (gig_id, reviewer_id, reviewee_id, rating)
     SELECT '00000000-0000-0000-0000-0000000000a1', w.id, o.id, 5
       FROM profiles w, profiles o
      WHERE w.user_id = '00000000-0000-0000-0000-00000000b004'
        AND o.user_id = '00000000-0000-0000-0000-00000000b001' $$,
  '42501', NULL, '#37 non-participant cannot review');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}', true);

SELECT lives_ok(
  $$ INSERT INTO reviews (gig_id, reviewer_id, reviewee_id, rating)
     SELECT '00000000-0000-0000-0000-0000000000a1', o.id, w.id, 4
       FROM profiles o, profiles w
      WHERE o.user_id = '00000000-0000-0000-0000-00000000b001'
        AND w.user_id = '00000000-0000-0000-0000-00000000b002' $$,
  '#37 gig owner can review an actual applicant');

-- ============================================================================
-- #44 — anon enumeration RPC revoked
-- ============================================================================
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT lookup_user_by_username_or_email('worker1@test.local') $$,
  '42501', NULL, '#44 user lookup RPC no longer callable by API role');

SELECT * FROM finish();
ROLLBACK;
