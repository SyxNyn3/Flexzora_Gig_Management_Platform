-- Regression: crew-to-crew marketplace (Flexzora Market).
-- Covers: listing RLS (browse vs ownership), order creation snapshotting
-- price+5% fee server-side, one-open-order-per-listing, party-only order
-- reads, guarded status transitions (no self-serve 'paid'/'sold'), the
-- service-role payment gate, and the shipped->delivered flow.
BEGIN;
SELECT plan(19);

-- fixtures: seller, buyer, unrelated bystander — all workers
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mk-seller@test.local', 'x', '{"full_name":"MK Seller","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mk-buyer@test.local', 'x', '{"full_name":"MK Buyer","role":"worker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mk-bystander@test.local', 'x', '{"full_name":"MK Bystander","role":"worker"}'::jsonb, now(), now());

CREATE TEMP TABLE mk_ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e001') AS seller_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e002') AS buyer_pid,
  (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000e003') AS bystander_pid;
GRANT SELECT ON mk_ids TO authenticated;
-- service_role runs the payment-path assertions below and reads mk_ids too —
-- temp-table privileges are per-role, so it needs its own grant.
GRANT SELECT ON mk_ids TO service_role;

-- fixed listing + order ids so later assertions can reference them
-- (created via RPC/direct insert below; capture with temp vars isn't possible
--  across role switches, so we look them up by known attributes instead)

-- ---- seller posts a listing (direct insert allowed by RLS) ----------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);

SELECT lives_ok(
  $$INSERT INTO marketplace_listings (seller_id, title, description, category, condition, price_cents, fulfillment)
    SELECT seller_pid, 'Aputure 300d Light', 'Barely used, includes case and stand.', 'tools', 'like_new', 34900, 'both'
      FROM mk_ids$$,
  'seller can create own listing');

-- ---- bystander: can browse active listings, cannot write as seller ---------
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM marketplace_listings WHERE title = 'Aputure 300d Light'),
  1, 'bystander can browse active listings');

SELECT throws_ok(
  $$INSERT INTO marketplace_listings (seller_id, title, category, price_cents)
    SELECT seller_pid, 'Fake listing', 'tools', 100 FROM mk_ids$$,
  'new row violates row-level security policy for table "marketplace_listings"',
  'bystander cannot insert a listing under another seller');

-- bystander cannot see orders at all (none exist yet, but policy must hold)
SELECT is(
  (SELECT count(*)::int FROM marketplace_orders),
  0, 'bystander sees no orders');

-- ---- buyer creates an order via the guarded RPC ---------------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT market_create_order(
      (SELECT id FROM marketplace_listings WHERE title = 'Aputure 300d Light'),
      'ship',
      '{"line1":"1 Stage Way","city":"Los Angeles","state":"CA","zip":"90028"}'::jsonb)$$,
  'buyer can create a shipped order');

-- price + fee snapshotted server-side: $349.00 -> fee = round(34900*0.05) = 1745
SELECT results_eq(
  $$SELECT amount_cents, fee_cents, status FROM marketplace_orders
     WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)$$,
  $$VALUES (34900, 1745, 'pending_payment'::text)$$,
  'order snapshots listing price and 5% fee');

-- ---- one open order per listing -------------------------------------------
SELECT throws_ok(
  $$SELECT market_create_order(
      (SELECT id FROM marketplace_listings WHERE title = 'Aputure 300d Light'),
      'pickup')$$,
  'this listing already has an open order',
  'second open order on same listing rejected');

-- seller cannot buy their own listing (self-check fires before the
-- open-order check inside market_create_order)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT market_create_order(
      (SELECT id FROM marketplace_listings WHERE title = 'Aputure 300d Light'),
      'pickup')$$,
  'cannot buy your own listing',
  'seller blocked from buying own listing');

-- direct UPDATE of status='sold' is silently reverted by the guard trigger
SELECT lives_ok(
  $$UPDATE marketplace_listings SET status = 'sold'
     WHERE title = 'Aputure 300d Light'$$,
  'seller direct sold-update executes');
SELECT is(
  (SELECT status FROM marketplace_listings WHERE title = 'Aputure 300d Light'),
  'active', 'guard trigger reverts seller-set sold');

-- ---- service role marks the order paid (simulates Stripe webhook) ---------
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT lives_ok(
  $$SELECT mark_market_order_paid(
      (SELECT id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)),
      'cs_test_fake', 'pi_fake')$$,
  'service role can mark order paid');

SELECT results_eq(
  $$SELECT o.status, l.status
      FROM marketplace_orders o JOIN marketplace_listings l ON l.id = o.listing_id
     WHERE o.buyer_id = (SELECT buyer_pid FROM mk_ids)$$,
  $$VALUES ('paid'::text, 'sold'::text)$$,
  'payment marks order paid AND listing sold atomically');

-- API roles can never call the payment function
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT mark_market_order_paid(
      (SELECT id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)),
      'cs_test_fake2', 'pi_fake2')$$,
  -- EXECUTE is revoked from API roles, so the gate fires as a permission
  -- error before the function body's 'service role only' raise is reached.
  'permission denied for function mark_market_order_paid',
  'buyer cannot self-serve mark paid');

-- ---- fulfilment flow: seller ships, buyer confirms ------------------------
-- bystander cannot touch the order
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT market_mark_shipped(
      (SELECT id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)),
      '1Z999', NULL)$$,
  'order not found',
  'bystander cannot mark someone else''s order shipped');

-- seller marks shipped with tracking
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT market_mark_shipped(
      (SELECT id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)),
      '1Z999AA10123456784', 'https://tools.example/track/1Z999')$$,
  'seller can mark paid order shipped');

-- seller cannot mark their own order delivered (buyer-only RPC)
SELECT throws_ok(
  $$SELECT market_mark_delivered(
      (SELECT id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)))$$,
  'order not found',
  'seller cannot confirm their own sale delivered');

-- buyer confirms delivery
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT market_mark_delivered(
      (SELECT id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)))$$,
  'buyer can confirm delivered');

SELECT is(
  (SELECT status FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)),
  'delivered', 'order ends delivered');

-- new orders on the sold listing are rejected. Resolve the listing through
-- the buyer's own order row: sold listings are RLS-hidden from buyers, so a
-- direct title lookup returns NULL ('listing not found') before the RPC's
-- availability check can fire.
SELECT throws_ok(
  $$SELECT market_create_order(
      (SELECT listing_id FROM marketplace_orders WHERE buyer_id = (SELECT buyer_pid FROM mk_ids)),
      'pickup')$$,
  'listing is not available',
  'sold listing rejects new orders');

SELECT * FROM finish();
ROLLBACK;
