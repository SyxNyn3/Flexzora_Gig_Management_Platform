-- Lane B: cert-gated swap preview. my_locked_swaps surfaces open swaps the
-- caller can't claim with THEIR missing certs + state — no requester data —
-- and returns nothing once the caller clears the gate.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000010a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cp-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000010a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cp-requester@test.local', 'x', '{"full_name":"Requester","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000010a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cp-uncerted@test.local', 'x', '{"full_name":"Uncerted","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000010a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cp-certed@test.local', 'x', '{"full_name":"Certed","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000010f1', 'PreviewCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000010a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000010d1', '00000000-0000-0000-0000-0000000010f1', 'Stage', '5 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000010e1', '00000000-0000-0000-0000-0000000010f1', '00000000-0000-0000-0000-0000000010d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000010a1'), 'Arena day', current_date + 12, current_date + 12, 'published');

-- cert-gated call: OSHA_10 required
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, required_cert_codes) VALUES
  ('00000000-0000-0000-0000-0000000010f2', '00000000-0000-0000-0000-0000000010e1', 'Rigging', 'Rigger', 2,
   now() + interval '12 days', now() + interval '12 days' + interval '8 hours', 45, 'open', '{OSHA_10}');

INSERT INTO shift_assignments (id, shift_id, worker_id, source, status, confirmed_at) VALUES
  ('00000000-0000-0000-0000-0000000010a5', '00000000-0000-0000-0000-0000000010f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000010a2'), 'direct_book', 'confirmed', now());

INSERT INTO swap_requests (id, assignment_id, shift_id, requester_worker_id, reason, sweetener_cents, status) VALUES
  ('00000000-0000-0000-0000-0000000010b1', '00000000-0000-0000-0000-0000000010a5', '00000000-0000-0000-0000-0000000010f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000010a2'), 'conflict', 2500, 'open');

-- uncerted worker: never had OSHA_10. certed worker: verified active.
INSERT INTO certifications (worker_id, name, cert_type_code, verified, is_active, verification_status)
SELECT id, 'OSHA 10', 'OSHA_10', true, true, 'verified' FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000010a4';

SET LOCAL ROLE authenticated;

-- 1: the uncerted worker can't see the swap through RLS…
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000010a3","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM swap_requests WHERE shift_id = '00000000-0000-0000-0000-0000000010f2'),
  0::bigint, 'RLS hides the swap from ineligible workers');

-- 2: …but the preview shows it with their missing cert
SELECT results_eq(
  $$ SELECT swap_id, sweetener_cents, missing -> 0 ->> 'code', missing -> 0 ->> 'state'
     FROM my_locked_swaps('00000000-0000-0000-0000-0000000010f2') $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000010b1'::uuid, 2500, 'OSHA_10'::text, 'missing'::text) $$,
  'preview returns the gap with a missing state');

-- 3: preview leaks no requester identity
SELECT is(
  (SELECT count(*) FROM my_locked_swaps('00000000-0000-0000-0000-0000000010f2') l
    WHERE l::text LIKE '%cp-requester%'),
  0::bigint, 'preview carries no requester identity');

-- 4: a certed worker gets no preview rows (they see the real swap)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000010a4","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM my_locked_swaps('00000000-0000-0000-0000-0000000010f2')),
  0::bigint, 'eligible workers see no locked preview');

-- 5: the requester's own swap never previews for them
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000010a2","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM my_locked_swaps('00000000-0000-0000-0000-0000000010f2')),
  0::bigint, 'requesters never preview their own swap');

SELECT * FROM finish();
ROLLBACK;
