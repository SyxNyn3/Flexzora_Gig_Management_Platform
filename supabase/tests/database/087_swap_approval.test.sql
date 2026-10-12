-- Lane B: company swap-approval. company_decision* are system-managed; only
-- company_decide_swap (owns_shift) stamps them — approve endorses and nudges
-- the claimer, reject cancels and cascades claims + the pending offer.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sa-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000f0a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sa-requester@test.local', 'x', '{"full_name":"Requester","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000f0a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sa-claimer@test.local', 'x', '{"full_name":"Claimer","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000f0f1', 'ApproveCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000f0d1', '00000000-0000-0000-0000-00000000f0f1', 'Stage', '4 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000f0e1', '00000000-0000-0000-0000-00000000f0f1', '00000000-0000-0000-0000-00000000f0d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a1'), 'Gala', current_date + 10, current_date + 11, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f0f2', '00000000-0000-0000-0000-00000000f0e1', 'Load-in', 'Stagehand', 2,
   now() + interval '10 days', now() + interval '10 days' + interval '8 hours', 40, 'open'),
  ('00000000-0000-0000-0000-00000000f0f3', '00000000-0000-0000-0000-00000000f0e1', 'Strike', 'Stagehand', 2,
   now() + interval '11 days', now() + interval '11 days' + interval '8 hours', 40, 'open');

-- two live 'offered' swaps (one per shift): requester confirmed on each,
-- claimer holding a pending offer on each — one per path under test
INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at) VALUES
  ('00000000-0000-0000-0000-00000000f0a4', '00000000-0000-0000-0000-00000000f0f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a2'), 'direct_book', 'confirmed', now()),
  ('00000000-0000-0000-0000-00000000f0a5', '00000000-0000-0000-0000-00000000f0f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a3'), 'public_marketplace', 'offered', NULL),
  ('00000000-0000-0000-0000-00000000f0a6', '00000000-0000-0000-0000-00000000f0f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a2'), 'direct_book', 'confirmed', now()),
  ('00000000-0000-0000-0000-00000000f0a7', '00000000-0000-0000-0000-00000000f0f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a3'), 'public_marketplace', 'offered', NULL);

INSERT INTO swap_requests (id, assignment_id, shift_id, requester_worker_id, reason, status, accepted_claim_id, offered_assignment_id) VALUES
  ('00000000-0000-0000-0000-00000000f0b1', '00000000-0000-0000-0000-00000000f0a4', '00000000-0000-0000-0000-00000000f0f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a2'), 'double-booked', 'offered', NULL, '00000000-0000-0000-0000-00000000f0a5'),
  ('00000000-0000-0000-0000-00000000f0b2', '00000000-0000-0000-0000-00000000f0a6', '00000000-0000-0000-0000-00000000f0f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a2'), 'travel', 'offered', NULL, '00000000-0000-0000-0000-00000000f0a7');

INSERT INTO swap_claims (id, swap_request_id, claimer_worker_id, status) VALUES
  ('00000000-0000-0000-0000-00000000f0c1', '00000000-0000-0000-0000-00000000f0b1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a3'), 'accepted'),
  ('00000000-0000-0000-0000-00000000f0c2', '00000000-0000-0000-0000-00000000f0b2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000f0a3'), 'accepted');


UPDATE swap_requests SET accepted_claim_id = '00000000-0000-0000-0000-00000000f0c1' WHERE id = '00000000-0000-0000-0000-00000000f0b1';
UPDATE swap_requests SET accepted_claim_id = '00000000-0000-0000-0000-00000000f0c2' WHERE id = '00000000-0000-0000-0000-00000000f0b2';

SET LOCAL ROLE authenticated;

-- 1: the requester cannot stamp the decision themselves
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f0a2","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE swap_requests SET company_decision = 'approved' WHERE id = '00000000-0000-0000-0000-00000000f0b1' $$,
  '42501', NULL, 'company_decision is system-managed');

-- 2: a worker cannot call the RPC
SELECT throws_ok(
  $$ SELECT company_decide_swap('00000000-0000-0000-0000-00000000f0b1', true) $$,
  '42501', NULL, 'non-owners cannot decide swaps');

-- 3: owner approves → stamped, swap stays offered (claimer still confirms)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f0a1","role":"authenticated"}', true);
SELECT results_eq(
  $$ SELECT company_decision, status FROM swap_requests WHERE id = '00000000-0000-0000-0000-00000000f0b1' $$,
  $$ SELECT company_decision, status FROM company_decide_swap('00000000-0000-0000-0000-00000000f0b1', true) $$,
  'approve stamps the decision and leaves the offer live');

-- 4: the decision is final
SELECT throws_ok(
  $$ SELECT company_decide_swap('00000000-0000-0000-0000-00000000f0b1', false, 'changed my mind') $$,
  'P0001', NULL, 'a decided swap cannot be re-decided');

-- 5: owner rejects r2 → cancelled + claim rejected + offer declined
SELECT lives_ok($$ SELECT company_decide_swap('00000000-0000-0000-0000-00000000f0b2', false, 'need the original crew') $$, 'reject succeeds');
SELECT results_eq(
  $$ SELECT r.status::text, c.status::text, a.status::text
     FROM swap_requests r
     JOIN swap_claims c ON c.id = r.accepted_claim_id
     JOIN shift_assignments a ON a.id = r.offered_assignment_id
     WHERE r.id = '00000000-0000-0000-0000-00000000f0b2' $$,
  $$ VALUES ('cancelled'::text, 'rejected'::text, 'declined'::text) $$,
  'reject cascades to the claim and the pending offer');

SELECT * FROM finish();
ROLLBACK;
