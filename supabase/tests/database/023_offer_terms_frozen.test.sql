-- Regression: issue #23 — the company could rewrite offered_rate after the
-- worker had accepted or been offered the call. approve_timesheet pays
-- COALESCE(offered_rate, hourly_rate), so that was a silent pay change.
-- Offer terms are now frozen from offered onward; a declined/withdrawn row may
-- be re-offered with a new rate.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner23@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker23a@test.local', 'x', '{"full_name":"Worker A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b303', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker23b@test.local', 'x', '{"full_name":"Worker B"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c300', 'Rate Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b301';

INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000c300', 'Rate show', '2027-03-01', '2027-03-02');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d300', '00000000-0000-0000-0000-00000000e300',
        'Call', 'Stagehand', 2, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open');

-- X1: offered to A at 30; X2: previously declined by B at 30
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source, offered_rate)
SELECT '00000000-0000-0000-0000-00000000a300', '00000000-0000-0000-0000-00000000d300', p.id, 'offered', 'direct_book', 30.00
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b302';
INSERT INTO shift_assignments (id, shift_id, worker_id, status, source, offered_rate)
SELECT '00000000-0000-0000-0000-00000000a301', '00000000-0000-0000-0000-00000000d300', p.id, 'declined', 'direct_book', 30.00
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b303';

SET LOCAL ROLE authenticated;

-- worker A accepts at the offered rate
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b302","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE shift_assignments SET status = 'confirmed' WHERE id = '00000000-0000-0000-0000-00000000a300'
$$, 'worker accepts the offer');

-- the company then tries to cut the booked rate
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b301","role":"authenticated"}', true);
SELECT throws_ok($$
  UPDATE shift_assignments SET offered_rate = 10 WHERE id = '00000000-0000-0000-0000-00000000a300'
$$, 'P0001', NULL, 'company cannot cut the rate of a confirmed booking');

SELECT throws_ok($$
  UPDATE shift_assignments SET match_score = 99 WHERE id = '00000000-0000-0000-0000-00000000a300'
$$, 'P0001', NULL, 'company cannot rewrite the match score of a confirmed booking');

-- a declined row can be re-offered at a new rate
SELECT lives_ok($$
  UPDATE shift_assignments SET status = 'offered', offered_rate = 40 WHERE id = '00000000-0000-0000-0000-00000000a301'
$$, 'company re-offers a declined call at a new rate');

-- but the new offer is frozen the moment it is out
SELECT throws_ok($$
  UPDATE shift_assignments SET offered_rate = 10 WHERE id = '00000000-0000-0000-0000-00000000a301'
$$, 'P0001', NULL, 'company cannot change terms of an outstanding offer');

RESET ROLE;
SELECT is((SELECT offered_rate::numeric FROM shift_assignments WHERE id = '00000000-0000-0000-0000-00000000a300'), 30.00::numeric,
          'confirmed booking keeps the rate it was offered at');

SELECT * FROM finish();
ROLLBACK;
