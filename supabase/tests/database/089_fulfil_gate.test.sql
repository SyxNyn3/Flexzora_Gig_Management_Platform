-- Red-team #19: paid 'offer' resolves park as awaiting_accept — the fulfiller
-- (debtor) must accept before the IOU mints. 'want' posts still mint on
-- resolve (the author is the debtor — their resolve IS the consent).
BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000020a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'fg-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000020a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'fg-author@test.local', 'x', '{"full_name":"Author","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-0000000020a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'fg-fulfiller@test.local', 'x', '{"full_name":"Fulfiller","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-0000000020f1', 'GateCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000020a1';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000020d1', '00000000-0000-0000-0000-0000000020f1', 'Dock', '6 Main', 34.0, -118.2);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-0000000020e1', '00000000-0000-0000-0000-0000000020f1', '00000000-0000-0000-0000-0000000020d1',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000020a1'), 'Show', current_date + 5, current_date + 5, 'published');

INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-0000000020f2', '00000000-0000-0000-0000-0000000020e1', 'Deck', 'Stagehand', 2,
   now() + interval '5 days', now() + interval '5 days' + interval '8 hours', 40, 'open');

INSERT INTO crew_posts (id, shift_id, author_worker_id, category, direction, title, amount_cents, status) VALUES
  ('00000000-0000-0000-0000-0000000020b1', '00000000-0000-0000-0000-0000000020f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000020a2'), 'ride', 'want', 'Need a seat', 2000, 'open'),
  ('00000000-0000-0000-0000-0000000020b2', '00000000-0000-0000-0000-0000000020f2',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000020a2'), 'borrow', 'offer', 'Spare harness, $15', 1500, 'open');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a2","role":"authenticated"}', true);

-- 1: want post resolves + mints immediately (author is the debtor)
SELECT ok(
  (SELECT count(*) = 0 FROM crew_posts WHERE id = '00000000-0000-0000-0000-0000000020b1' AND status <> 'open'),
  'want post starts open');
UPDATE crew_posts SET status = 'resolved',
       fulfilled_by_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000020a3')
 WHERE id = '00000000-0000-0000-0000-0000000020b1';
SELECT is(
  (SELECT count(*) FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-0000000020b1' AND amount_cents = 2000),
  1::bigint, 'want resolve mints the IOU (author consented by resolving)');

-- 2: paid offer resolve parks instead of minting on the fulfiller
UPDATE crew_posts SET status = 'resolved',
       fulfilled_by_worker_id = (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-0000000020a3')
 WHERE id = '00000000-0000-0000-0000-0000000020b2';
SELECT is(
  (SELECT status::text FROM crew_posts WHERE id = '00000000-0000-0000-0000-0000000020b2'),
  'awaiting_accept', 'paid offer resolve parks for fulfiller consent');
SELECT is(
  (SELECT count(*) FROM crew_iou WHERE iou_group_id = '00000000-0000-0000-0000-0000000020b2'),
  0::bigint, 'no IOU until the fulfiller accepts');

-- 3: the fulfiller was alerted (checked as owner — the author's RLS scope
-- cannot read alerts addressed to another worker)
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM crew_alerts WHERE ref_id = '00000000-0000-0000-0000-0000000020b2' AND kind = 'iou'),
  1::bigint, 'fulfiller gets the accept/decline alert');

-- 4: the author cannot force it through while awaiting
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a2","role":"authenticated"}', true);
SELECT throws_ok(
  $$ UPDATE crew_posts SET status = 'resolved' WHERE id = '00000000-0000-0000-0000-0000000020b2' $$,
  NULL, NULL, 'author cannot bypass the fulfiller gate');

-- 5: fulfiller declines → post re-opens, nomination cleared, no IOU
-- (state check runs as owner — post-decline the fulfiller is no longer a
-- named party, so RLS would hide the row from them)
RESET ROLE;
SELECT is((SELECT status::text FROM crew_posts WHERE id = '00000000-0000-0000-0000-0000000020b2'),
  'awaiting_accept', 'b2 is awaiting before decline');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a3","role":"authenticated"}', true);
SELECT ok(decline_fulfilment('00000000-0000-0000-0000-0000000020b2') IS NOT NULL, 'fulfiller declines');
RESET ROLE;
SELECT results_eq(
  $$ SELECT status::text, fulfilled_by_worker_id IS NULL FROM crew_posts WHERE id = '00000000-0000-0000-0000-0000000020b2' $$,
  $$ VALUES ('open'::text, true) $$,
  'decline re-opens the post with the nomination cleared');

SELECT * FROM finish();
ROLLBACK;
