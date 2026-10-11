-- Regression: issue #19 — board-resolve minted a payout-deduction IOU against
-- a worker who never agreed to it. Minting now requires the DEBTOR's own
-- acceptance: the author for a 'want' post, the fulfiller for an 'offer' post.
BEGIN;
SELECT plan(15);

-- fixtures: a company owner, two crew workers, and an outsider
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner19@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker19a@test.local', 'x', '{"full_name":"Worker A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b903', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker19b@test.local', 'x', '{"full_name":"Worker B"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b904', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'outsider19@test.local', 'x', '{"full_name":"Outsider"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c190', 'Consent Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b901';

INSERT INTO events (id, company_id, name, starts_on, ends_on)
VALUES ('00000000-0000-0000-0000-00000000e190', '00000000-0000-0000-0000-00000000c190', 'Consent show', '2027-03-01', '2027-03-02');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status)
VALUES ('00000000-0000-0000-0000-00000000d190', '00000000-0000-0000-0000-00000000e190',
        'Call', 'Stagehand', 4, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open');

-- A: want (author owes)   B: offer (fulfiller owes)   C: offer   D: open, to be self-fulfilled
INSERT INTO crew_posts (id, shift_id, author_worker_id, category, direction, title, amount_cents, status)
SELECT v.id, '00000000-0000-0000-0000-00000000d190', p.id, 'borrow'::crew_post_category, v.dir::crew_post_direction, v.title, v.amount, 'open'::crew_post_status
FROM profiles p
CROSS JOIN (VALUES
  ('19000000-0000-0000-0000-0000000000a1'::uuid, 'want'::text,  'Gloves A',  1000),
  ('19000000-0000-0000-0000-0000000000b1'::uuid, 'offer'::text, 'Harness B', 2000),
  ('19000000-0000-0000-0000-0000000000c1'::uuid, 'offer'::text, 'Rope C',    500),
  ('19000000-0000-0000-0000-0000000000d1'::uuid, 'offer'::text, 'Clamp D',    300)
) AS v(id, dir, title, amount)
WHERE p.user_id = '00000000-0000-0000-0000-00000000b902';

-- the API role from here on
SET LOCAL ROLE authenticated;

-- A: author (the debtor for a want) resolves and names worker B → consent is
-- the resolve itself, so the IOU mints immediately.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b902","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE crew_posts SET status = 'resolved',
    fulfilled_by_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b903')
  WHERE id = '19000000-0000-0000-0000-0000000000a1'
$$, 'author resolves a want post naming a fulfiller');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '19000000-0000-0000-0000-0000000000a1'
            AND worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b902')),
          1, 'want post mints exactly one IOU against the author (the debtor)');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b902","role":"authenticated"}', true);

-- B: an OFFER resolved by the author naming worker B. B is the debtor and has
-- not agreed, so NOTHING may mint yet (the exploit from #19).
SELECT lives_ok($$
  UPDATE crew_posts SET status = 'resolved',
    fulfilled_by_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b903')
  WHERE id = '19000000-0000-0000-0000-0000000000b1'
$$, 'author resolves an offer post naming the fulfiller');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '19000000-0000-0000-0000-0000000000b1'), 0,
          'offer post does not mint before the fulfiller (debtor) accepts');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b902","role":"authenticated"}', true);

-- the author cannot swap the debtor after resolution
SELECT throws_ok($$
  UPDATE crew_posts SET fulfilled_by_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b904')
  WHERE id = '19000000-0000-0000-0000-0000000000b1'
$$, 'P0001', NULL, 'resolved post cannot have its fulfiller swapped to someone who never agreed');

-- the author cannot record the debtor's consent on their behalf
SELECT throws_ok($$
  UPDATE crew_posts SET debtor_confirmed_at = now() WHERE id = '19000000-0000-0000-0000-0000000000b1'
$$, 'P0001', NULL, 'author cannot stamp the fulfiller/debtor consent');

-- an outsider's accept is invisible under RLS and changes nothing
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b904","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE crew_posts SET debtor_confirmed_at = now() WHERE id = '19000000-0000-0000-0000-0000000000b1'
$$, 'outsider attempts to accept a debt they do not owe');

RESET ROLE;
SELECT is((SELECT debtor_confirmed_at FROM crew_posts WHERE id = '19000000-0000-0000-0000-0000000000b1') IS NULL, true,
          'outsider consent did not land');

SET LOCAL ROLE authenticated;

-- the debtor (fulfiller B) accepts → the IOU mints now, against B
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b903","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE crew_posts SET debtor_confirmed_at = now() WHERE id = '19000000-0000-0000-0000-0000000000b1'
$$, 'debtor accepts the offer post');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '19000000-0000-0000-0000-0000000000b1'
            AND worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b903')),
          1, 'accepting mints one IOU against the debtor who accepted');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b903","role":"authenticated"}', true);
SELECT throws_ok($$
  UPDATE crew_posts SET debtor_confirmed_at = now() WHERE id = '19000000-0000-0000-0000-0000000000b1'
$$, 'P0001', NULL, 'consent cannot be re-recorded, so the IOU cannot be minted twice');

-- C: an offer resolved and never accepted: still zero IOUs
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b902","role":"authenticated"}', true);
SELECT lives_ok($$
  UPDATE crew_posts SET status = 'resolved',
    fulfilled_by_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b903')
  WHERE id = '19000000-0000-0000-0000-0000000000c1'
$$, 'second offer resolved, left unaccepted');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM crew_iou WHERE iou_group_id = '19000000-0000-0000-0000-0000000000c1'), 0,
          'unaccepted offer stays unminted');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b902","role":"authenticated"}', true);

-- a post cannot be fulfilled by its own author
SELECT throws_ok($$
  UPDATE crew_posts SET status = 'resolved', fulfilled_by_worker_id = author_worker_id
  WHERE id = '19000000-0000-0000-0000-0000000000d1'
$$, 'P0001', NULL, 'self-fulfilled post is rejected');

-- a paid post must name a fulfiller
SELECT throws_ok($$
  UPDATE crew_posts SET status = 'resolved' WHERE id = '19000000-0000-0000-0000-0000000000d1'
$$, 'P0001', NULL, 'paid post cannot resolve without naming who fulfilled it');

SELECT * FROM finish();
ROLLBACK;
