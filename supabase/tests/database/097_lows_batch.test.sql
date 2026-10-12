-- Red-team LOW batch: #39 paid-start cap, #54 late-cancels, #40 definer
-- reliability, #35 temporal gates, #32 swap re-claim, #33 tz-aware briefing.
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000064a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lb-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000064a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lb-w1@test.local', 'x', '{"full_name":"Wone","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000064a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lb-w2@test.local', 'x', '{"full_name":"Wtwo","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000064a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lb-w3@test.local', 'x', '{"full_name":"Wthree","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000064f1', 'LowCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000064d1', '00000000-0000-0000-0000-0000000064f1', 'Barn', '44 Route', 40.7, -73.9);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status, timezone) VALUES
  ('00000000-0000-0000-0000-0000000064e1', '00000000-0000-0000-0000-0000000064f1', '00000000-0000-0000-0000-0000000064d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a1'), 'Show', current_date + 6, current_date + 6, 'published', 'America/New_York');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000064f2', '00000000-0000-0000-0000-0000000064e1', 'Stage', 'Hand', 4,
   (current_date + 6)::timestamptz + interval '8 hours',
   (current_date + 6)::timestamptz + interval '16 hours', 40, 'open'),
  ('00000000-0000-0000-0000-0000000064f3', '00000000-0000-0000-0000-0000000064e1', 'Spot', 'Spot', 2,
   now() + interval '6 hours', now() + interval '14 hours', 40, 'open');

INSERT INTO escrow_deposits (id, event_id, company_id, amount, status)
VALUES ('00000000-0000-0000-0000-0000000064b0', '00000000-0000-0000-0000-0000000064e1',
        '00000000-0000-0000-0000-0000000064f1', 5000, 'funded');

-- worker with home geo for the departure briefing
INSERT INTO worker_sensitive (worker_id, latitude, longitude)
SELECT id, 40.8, -73.8 FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a2';

-- #39 fixture: confirmed assignment + submitted timesheet, clock-in 60min early
INSERT INTO shift_assignments (id, shift_id, worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000064c1', '00000000-0000-0000-0000-0000000064f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a2'), 'confirmed');
INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, clock_in_at, clock_out_at, status) VALUES
  ('00000000-0000-0000-0000-0000000064c2', '00000000-0000-0000-0000-0000000064c1', '00000000-0000-0000-0000-0000000064f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a2'),
   (current_date + 6)::timestamptz + interval '7 hours',          -- 60min early
   (current_date + 6)::timestamptz + interval '16 hours', 'submitted');

-- #54 fixture: a confirmed booking withdrawn inside 24h of call
INSERT INTO shift_assignments (id, shift_id, worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000064c3', '00000000-0000-0000-0000-0000000064f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a3'), 'confirmed');
UPDATE shift_assignments SET status = 'withdrawn' WHERE id = '00000000-0000-0000-0000-0000000064c3';

-- #32 fixture: a claim that was withdrawn, then re-claimed — the requester
-- needs a LIVE assignment (64c3 was withdrawn above for the #54 fixture)
INSERT INTO shift_assignments (id, shift_id, worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000064c4', '00000000-0000-0000-0000-0000000064f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a4'), 'confirmed'),
  ('00000000-0000-0000-0000-0000000064c7', '00000000-0000-0000-0000-0000000064f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a3'), 'confirmed');
INSERT INTO swap_requests (id, assignment_id, shift_id, requester_worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000064c5', '00000000-0000-0000-0000-0000000064c7', '00000000-0000-0000-0000-0000000064f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a3'), 'open');
INSERT INTO swap_claims (swap_request_id, claimer_worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000064c5',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a4'), 'withdrawn');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a1","role":"authenticated"}', true);

-- #39: approving pays call-time hours (8h), not the 9h from early clock-in
SELECT lives_ok($$ SELECT approve_timesheet('00000000-0000-0000-0000-0000000064c2', NULL, 'ach') $$,
  'approval succeeds with funded escrow');
SELECT is(
  (SELECT regular_hours FROM timesheets WHERE id = '00000000-0000-0000-0000-0000000064c2'),
  8.00::numeric, 'paid start capped at call time — no free hour (#39)');

-- #54/#40: the inside-24h withdraw surfaces as a late_cancel
SELECT is(
  (SELECT late_cancels FROM worker_reliability(
     (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a3'))),
  1, 'last-minute bail counted as late_cancel (#54)');

-- #35: temporal gates (a4 is booked on f3 — passes RLS + booking, hits the gate)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a4","role":"authenticated"}', true);
SELECT throws_ok(
  $$ INSERT INTO food_runs (shift_id, runner_worker_id, restaurant, order_cutoff_at)
     VALUES ('00000000-0000-0000-0000-0000000064f3',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a4'),
             'Deli', now() - interval '1 hour') $$,
  'P0001', NULL, 'past order cutoff rejected (#35)');
SELECT throws_ok(
  $$ INSERT INTO lodging_pools (shift_id, host_worker_id, kind, name, spots, check_in_at, check_out_at, share_cents)
     VALUES ('00000000-0000-0000-0000-0000000064f3',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a4'),
             'hotel', 'Bunk', 2, now() + interval '2 days', now() + interval '1 day', 5000) $$,
  '23514', NULL, 'checkout before checkin rejected (#35)');

-- #32: a withdrawn claim doesn't block re-entry
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a4","role":"authenticated"}', true);
SELECT lives_ok(
  $$ INSERT INTO swap_claims (swap_request_id, claimer_worker_id)
     VALUES ('00000000-0000-0000-0000-0000000064c5',
             (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a4')) $$,
  'withdrawn claimer can re-claim (#32)');

-- #33: departure briefing speaks the event's wall-clock zone
RESET ROLE;
INSERT INTO shift_assignments (id, shift_id, worker_id, status) VALUES
  ('00000000-0000-0000-0000-0000000064c6', '00000000-0000-0000-0000-0000000064f3',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a2'), 'confirmed');
SELECT ok(EXISTS(
    SELECT 1 FROM crew_alerts
     WHERE dedupe_key LIKE '%briefing:departure:00000000-0000-0000-0000-0000000064c6%'
       AND title LIKE '%America/New_York%'),
  'departure alert renders in the event timezone (#33)');

-- #42: a targeted gig message is invisible to accepted non-recipients
INSERT INTO gigs (id, title, description, created_by, location, start_date, end_date, status)
VALUES ('00000000-0000-0000-0000-0000000064d5', 'Gig', 'd',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a1'),
        'Barn', now() + interval '6 days', now() + interval '7 days', 'published');
INSERT INTO gig_applications (gig_id, worker_id, status)
SELECT '00000000-0000-0000-0000-0000000064d5', id, 'accepted' FROM profiles
 WHERE user_id IN ('00000000-0000-0000-0000-0000000064a2', '00000000-0000-0000-0000-0000000064a3');
INSERT INTO gig_messages (id, gig_id, sender_id, title, content, recipients)
VALUES ('00000000-0000-0000-0000-0000000064d6', '00000000-0000-0000-0000-0000000064d5',
        (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a1'),
        'W1 only', 'just for you',
        ARRAY[(SELECT id::text FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a2')]);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a3","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM gig_messages WHERE id = '00000000-0000-0000-0000-0000000064d6'),
  0, 'targeted message hidden from accepted non-recipients (#42)');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a2","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM gig_messages WHERE id = '00000000-0000-0000-0000-0000000064d6'),
  1, 'named recipient still reads it');

-- #40: assert reliability returns rows under a plain authenticated role
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a3","role":"authenticated"}', true);
SELECT is(
  (SELECT withdrawn FROM worker_reliability(
     (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000064a3'))),
  1, 'worker_reliability counts cross-RLS rows via definer (#40)');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
