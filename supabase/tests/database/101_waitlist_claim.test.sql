-- Waitlist claim: a verified waitlist row converts to a real account via
-- claim_waitlist_spot() — matched on the caller's CONFIRMED auth email,
-- never a client-supplied parameter. Runs under `supabase test db`.
--
-- NOTE: waiting_list inserts run through waitlist_sanitize_anon_insert,
-- which regenerates referral_code and resets server fields whenever the
-- request isn't service_role — so fixtures key on EMAIL, not referral_code,
-- and restore verified status with a follow-up UPDATE (no UPDATE trigger).
BEGIN;
SELECT plan(11);

-- fixtures: three auth users — confirmed claimant, unconfirmed user
-- (must NOT claim), confirmed user whose waitlist row is still pending.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'claimant@test.local', 'x', now(),
   '{"full_name":"Claim Ant","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'unconfirmed@test.local', 'x', NULL,
   '{"full_name":"Unconfirmed","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pendingwl@test.local', 'x', now(),
   '{"full_name":"Pending WL","role":"worker"}'::jsonb, now(), now());

-- verified waitlist row for the CONFIRMED claimant, crew-card fields set
INSERT INTO waiting_list (email, role_interest, status, full_name, phone, market_city, day_rate_min)
VALUES ('Claimant@Test.Local', 'worker', 'pending', 'Claim Ant', '+1 555 0100', 'Nashville', 450);
UPDATE waiting_list SET status = 'verified', verified_at = now()
  WHERE email = 'Claimant@Test.Local';

-- verified waitlist row for the UNCONFIRMED user
INSERT INTO waiting_list (email, role_interest, status)
VALUES ('unconfirmed@test.local', 'company', 'pending');
UPDATE waiting_list SET status = 'verified', verified_at = now()
  WHERE email = 'unconfirmed@test.local';

-- UNVERIFIED waitlist row for the third confirmed user — never claimable
INSERT INTO waiting_list (email, role_interest, status)
VALUES ('pendingwl@test.local', 'worker', 'pending');

-- ---------- claimant: confirmed email, verified waitlist row ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}', true);

SELECT is(
  (SELECT (public.claim_waitlist_spot())->>'claimed')::boolean,
  true, 'confirmed user with verified waitlist row claims successfully');

SELECT is(
  (SELECT (public.claim_waitlist_spot())->>'already_claimed')::boolean,
  true, 'second call is idempotent (already_claimed)');

SELECT is(
  (SELECT claimed_by_profile_id FROM waiting_list WHERE email = 'Claimant@Test.Local'),
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a101'),
  'waitlist row links to the claimant profile');

SELECT is(
  (SELECT phone FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a101'),
  '+1 555 0100', 'empty profile phone prefilled from crew card');

SELECT is(
  (SELECT location FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a101'),
  'Nashville', 'empty profile location prefilled from market_city');

SELECT is(
  (SELECT day_rate FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000a101'),
  450::numeric, 'empty profile day_rate prefilled from day_rate_min');

-- claimant can now read back their own claimed crew card via RLS
SELECT is(
  (SELECT count(*)::int FROM waiting_list WHERE email = 'Claimant@Test.Local'),
  1, 'claimant can SELECT own claimed waitlist row');

-- ---------- unconfirmed user: matching verified row must NOT claim ----
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a102","role":"authenticated"}', true);

SELECT is(
  (SELECT (public.claim_waitlist_spot())->>'claimed')::boolean,
  false, 'unconfirmed auth email cannot claim a verified waitlist row');

SELECT ok(
  (SELECT claimed_by_profile_id FROM waiting_list WHERE email = 'unconfirmed@test.local') IS NULL,
  'unclaimed row stays unclaimed for unconfirmed user');

-- ---------- confirmed user, UNVERIFIED waitlist row: no claim ---------
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a103","role":"authenticated"}', true);

SELECT is(
  (SELECT (public.claim_waitlist_spot())->>'claimed')::boolean,
  false, 'pending (unverified) waitlist row is not claimable');

-- anonymous callers get a generic negative, never an exception or reason
-- code that could probe waitlist membership (by design — see the function)
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(
  (SELECT (public.claim_waitlist_spot())->>'claimed')::boolean,
  false, 'anonymous callers get claimed:false, not an error');

SELECT * FROM finish();
ROLLBACK;
