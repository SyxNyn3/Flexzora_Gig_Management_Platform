-- Regression: issue #22 — swap_requests / swap_claims had guards only on
-- `status`, so the requester could re-point shift_id (cert-gate bypass),
-- offered_assignment_id (victim booking withdrawn by the handoff trigger),
-- drop the sweetener after claims arrived, or rewrite claimer_worker_id.
BEGIN;
SELECT plan(9);

-- fixtures (seed: worker1, worker2, Demo Productions public shift)
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source)
SELECT 'bbbb0022-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002', p.id, 'confirmed', 'public_marketplace'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002';
-- a second, unrelated confirmed booking (the "victim")
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source)
SELECT 'bbbb0022-0000-4000-8000-000000000009', '33333333-0000-4000-8000-000000000001', p.id, 'confirmed', 'public_marketplace'
FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000003';

-- requester (worker1) posts the swap through the API role
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT lives_ok($$
  INSERT INTO swap_requests (id, assignment_id, shift_id, requester_worker_id, reason, sweetener_cents)
  SELECT 'eeee0022-0000-4000-8000-000000000001', 'bbbb0022-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002', p.id, 'family thing', 2500
  FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000002'
$$, 'requester posts swap');

-- before any claim exists the sweetener is still editable
SELECT lives_ok($$ UPDATE swap_requests SET sweetener_cents = 3000 WHERE id = 'eeee0022-0000-4000-8000-000000000001' $$,
  'sweetener editable while no claim exists');

-- anchors are immutable from the start
SELECT throws_ok($$ UPDATE swap_requests SET shift_id = '33333333-0000-4000-8000-000000000001' WHERE id = 'eeee0022-0000-4000-8000-000000000001' $$,
  '42501', NULL, '#22A shift_id cannot be re-pointed (cert-gate bypass)');
SELECT throws_ok($$ UPDATE swap_requests SET offered_assignment_id = 'bbbb0022-0000-4000-8000-000000000009' WHERE id = 'eeee0022-0000-4000-8000-000000000001' $$,
  '42501', NULL, '#22B offered_assignment_id cannot be aimed at a victim booking');
SELECT throws_ok($$ UPDATE swap_requests SET assignment_id = 'bbbb0022-0000-4000-8000-000000000009' WHERE id = 'eeee0022-0000-4000-8000-000000000001' $$,
  '42501', NULL, '#22 assignment_id immutable');

-- worker2 claims
SELECT set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT lives_ok($$
  INSERT INTO swap_claims (id, swap_request_id, claimer_worker_id, message)
  SELECT 'ffff0022-0000-4000-8000-000000000001', 'eeee0022-0000-4000-8000-000000000001', p.id, 'I can take it'
  FROM profiles p WHERE p.user_id = '11111111-0000-4000-8000-000000000003'
$$, 'claimer files a claim');

-- back to the requester: sweetener is now locked, claim identity immutable
SELECT set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT throws_ok($$ UPDATE swap_requests SET sweetener_cents = 0 WHERE id = 'eeee0022-0000-4000-8000-000000000001' $$,
  '42501', NULL, '#22C sweetener locked once a claim exists (bait-and-switch)');
SELECT throws_ok($$ UPDATE swap_claims SET claimer_worker_id = (SELECT id FROM profiles WHERE user_id = '11111111-0000-4000-8000-000000000001')
                     WHERE id = 'ffff0022-0000-4000-8000-000000000001' $$,
  '42501', NULL, '#22 claimer_worker_id cannot be rewritten to a non-consenting worker');

-- the legitimate path still works: requester cancels
SELECT lives_ok($$ UPDATE swap_requests SET status = 'cancelled' WHERE id = 'eeee0022-0000-4000-8000-000000000001' $$,
  'requester can still cancel');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
