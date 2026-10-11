-- Red-team #19: paid 'offer' resolves park as awaiting_accept — the fulfiller
-- (debtor) must accept before the IOU mints. 'want' posts still mint on
-- resolve (the author is the debtor — their resolve IS the consent).
BEGIN;
SELECT plan(8);

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

-- 3: the fulfiller was alerted
SELECT is(
  (SELECT count(*) FROM crew_alerts WHERE ref_id = '00000000-0000-0000-0000-0000000020b2' AND kind = 'iou'),
  1::bigint, 'fulfiller gets the accept/decline alert');

-- 4: the author cannot force it through while awaiting
SELECT throws_ok(
  $$ UPDATE crew_posts SET status = 'resolved' WHERE id = '00000000-0000-0000-0000-0000000020b2' $$,
  NULL, NULL, 'author cannot bypass the fulfiller gate');

-- 5: fulfiller declines → post re-opens, nomination cleared, no IOU
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a3","role":"authenticated"}', true);
SELECT ok(decline_fulfilment('00000000-0000-0000-0000-0000000020b2') IS NOT NULL, 'fulfiller declines');
SELECT results_eq(
  $$ SELECT status::text, fulfilled_by_worker_id IS NULL FROM crew_posts WHERE id = '00000000-0000-0000-0000-0000000020b2' $$,
  $$ VALUES ('open'::text, true) $$,
  'decline re-opens the post with the nomination cleared');

SELECT * FROM finish();
ROLLBACK;
