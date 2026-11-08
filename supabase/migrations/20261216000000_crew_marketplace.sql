-- ============================================================================
-- Crew-to-crew tools marketplace ("Flexzora Market")
-- ============================================================================
-- Product decision (2026-11-08, user-directed): crew members can sell tools
-- and gear to each other; Flexzora takes a 5% platform fee on each sale.
-- User chose: 5% fee, pickup OR shipping per listing, full v1 with
-- shipping address capture + tracking.
--
-- Design rules inherited from the worker-ledger work:
--   * Money is integer cents, never floats.
--   * The browser never dictates price/fee — orders are created by an RPC
--     that reads the listing row, and payment confirmation comes only from
--     the Stripe webhook (service role).
--   * Status transitions are guarded: a seller cannot mark their own order
--     "paid" or "delivered"; "sold" on a listing is set only by the payment
--     path, never by a direct table write.
--   * No escrow language anywhere — payment goes straight to the seller's
--     Stripe Connect account minus the 5% application fee (destination
--     charge). Funds move at checkout; fulfilment is between the parties.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- marketplace_listings — one row per item a worker is selling.
-- seller_id references profiles (not auth.users) to match current_profile_id().
-- photo_paths is a jsonb array of storage paths in the public 'market-photos'
-- bucket — paths are server-generated at upload time, never client-claimed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description   text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  category      text NOT NULL CHECK (category IN
                  ('tools','cases','cables','apparel','vehicles','other')),
  condition     text NOT NULL DEFAULT 'good' CHECK (condition IN
                  ('new','like_new','good','fair')),
  price_cents   integer NOT NULL CHECK (price_cents BETWEEN 100 AND 10000000),
  -- 'pickup' = buyer arranges local handoff; 'ship' = seller ships (address
  -- captured at checkout); 'both' = buyer chooses at purchase time.
  fulfillment   text NOT NULL DEFAULT 'both' CHECK (fulfillment IN
                  ('pickup','ship','both')),
  photo_paths   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN
                  ('active','sold','removed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_listings_status_idx
  ON marketplace_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_idx
  ON marketplace_listings (seller_id, status);

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can browse active listings; sellers see all their own
-- rows including sold/removed so "My listings" can show history.
DROP POLICY IF EXISTS "market listings read" ON marketplace_listings;
CREATE POLICY "market listings read" ON marketplace_listings
  FOR SELECT TO authenticated
  USING (status = 'active' OR seller_id = current_profile_id());

DROP POLICY IF EXISTS "market listings insert own" ON marketplace_listings;
CREATE POLICY "market listings insert own" ON marketplace_listings
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = current_profile_id());

DROP POLICY IF EXISTS "market listings update own" ON marketplace_listings;
CREATE POLICY "market listings update own" ON marketplace_listings
  FOR UPDATE TO authenticated
  USING (seller_id = current_profile_id())
  WITH CHECK (seller_id = current_profile_id());

DROP POLICY IF EXISTS "market listings delete own" ON marketplace_listings;
CREATE POLICY "market listings delete own" ON marketplace_listings
  FOR DELETE TO authenticated
  USING (seller_id = current_profile_id());

-- Guard: sellers may flip active<->removed, but 'sold' is reserved for the
-- payment path (mark_market_order_paid). A direct UPDATE setting status='sold'
-- is silently reverted — same pattern as guard_onboarding_items.
CREATE OR REPLACE FUNCTION guard_market_listing_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold' THEN
    -- Only the service role (payment webhook) may mark a listing sold.
    -- API calls always carry a profile id; service role does not.
    IF current_profile_id() IS NOT NULL THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_listing_status_guard ON marketplace_listings;
CREATE TRIGGER market_listing_status_guard
  BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION guard_market_listing_status();

-- ---------------------------------------------------------------------------
-- marketplace_orders — one row per purchase attempt.
-- Created ONLY via market_create_order (security definer) so the price and
-- fee are read from the listing row, never from the client. Payment state
-- moves only via the Stripe webhook (service role) or the RPCs below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id                uuid NOT NULL REFERENCES marketplace_listings(id),
  buyer_id                  uuid NOT NULL REFERENCES profiles(id),
  seller_id                 uuid NOT NULL REFERENCES profiles(id),
  amount_cents              integer NOT NULL CHECK (amount_cents > 0),
  fee_cents                 integer NOT NULL CHECK (fee_cents >= 0),
  currency                  text NOT NULL DEFAULT 'usd',
  fulfillment               text NOT NULL CHECK (fulfillment IN ('pickup','ship')),
  shipping_address          jsonb,           -- {line1,city,state,zip,country}
  tracking_number           text,
  tracking_url              text,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id  text,
  status                    text NOT NULL DEFAULT 'pending_payment' CHECK (status IN
                              ('pending_payment','paid','shipped','delivered',
                               'cancelled','disputed')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  paid_at                   timestamptz,
  shipped_at                timestamptz,
  delivered_at              timestamptz,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_idx
  ON marketplace_orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_orders_seller_idx
  ON marketplace_orders (seller_id, created_at DESC);

ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;

-- Parties can read their own orders; nobody else sees them.
DROP POLICY IF EXISTS "market orders read parties" ON marketplace_orders;
CREATE POLICY "market orders read parties" ON marketplace_orders
  FOR SELECT TO authenticated
  USING (buyer_id = current_profile_id() OR seller_id = current_profile_id());

-- No direct INSERT/UPDATE/DELETE policies: all writes go through the
-- security-definer RPCs below, which enforce who may do what.
REVOKE INSERT, UPDATE, DELETE ON marketplace_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON marketplace_orders FROM anon;

-- ---------------------------------------------------------------------------
-- market_create_order — buyer starts a purchase.
-- Validates: listing exists + active, buyer != seller, fulfillment is one
-- the listing allows, shipping address required when fulfillment='ship'.
-- Snapshots amount + 5% fee from the listing row so the client cannot
-- influence either. Returns the new order id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION market_create_order(
  p_listing_id uuid,
  p_fulfillment text,
  p_shipping_address jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid := current_profile_id();
  v_listing marketplace_listings%ROWTYPE;
  v_order_id uuid;
  v_fee integer;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_fulfillment NOT IN ('pickup','ship') THEN
    RAISE EXCEPTION 'fulfillment must be pickup or ship';
  END IF;

  SELECT * INTO v_listing FROM marketplace_listings
    WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing not found';
  END IF;
  IF v_listing.status <> 'active' THEN
    RAISE EXCEPTION 'listing is not available';
  END IF;
  IF v_listing.seller_id = v_buyer THEN
    RAISE EXCEPTION 'cannot buy your own listing';
  END IF;
  IF NOT (v_listing.fulfillment = 'both'
          OR v_listing.fulfillment = p_fulfillment) THEN
    RAISE EXCEPTION 'this listing is % only', v_listing.fulfillment;
  END IF;
  IF p_fulfillment = 'ship' THEN
    IF p_shipping_address IS NULL
       OR COALESCE(p_shipping_address->>'line1','') = ''
       OR COALESCE(p_shipping_address->>'city','') = ''
       OR COALESCE(p_shipping_address->>'zip','') = '' THEN
      RAISE EXCEPTION 'shipping address required for shipped orders';
    END IF;
  END IF;

  -- 5% platform fee, rounded to the cent (integer cents throughout).
  v_fee := round(v_listing.price_cents * 0.05)::integer;

  INSERT INTO marketplace_orders
    (listing_id, buyer_id, seller_id, amount_cents, fee_cents,
     fulfillment, shipping_address)
  VALUES
    (v_listing.id, v_buyer, v_listing.seller_id, v_listing.price_cents,
     v_fee, p_fulfillment, p_shipping_address)
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION market_create_order(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION market_create_order(uuid, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- mark_market_order_paid — service-role only; called by the Stripe webhook
-- after checkout.session.completed verifies amount + metadata. Marks the
-- order paid and the listing sold atomically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_market_order_paid(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order marketplace_orders%ROWTYPE;
BEGIN
  -- Service-role gate: same pattern as the onboarding guard — API roles
  -- always resolve a profile id, service role does not.
  IF current_profile_id() IS NOT NULL THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  SELECT * INTO v_order FROM marketplace_orders
    WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status = 'paid' THEN
    RETURN; -- idempotent: Stripe retries must not error
  END IF;
  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'order is % — cannot mark paid', v_order.status;
  END IF;

  UPDATE marketplace_orders SET
    status = 'paid',
    stripe_checkout_session_id = p_session_id,
    stripe_payment_intent_id = p_payment_intent,
    paid_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  UPDATE marketplace_listings SET status = 'sold'
    WHERE id = v_order.listing_id;
END;
$$;

REVOKE ALL ON FUNCTION mark_market_order_paid(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_market_order_paid(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION mark_market_order_paid(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION mark_market_order_paid(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- market_mark_shipped — seller only; paid -> shipped with tracking info.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION market_mark_shipped(
  p_order_id uuid,
  p_tracking_number text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid := current_profile_id();
  v_order marketplace_orders%ROWTYPE;
BEGIN
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_order FROM marketplace_orders
    WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.seller_id <> v_seller THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'order is % — only paid orders can ship', v_order.status;
  END IF;
  UPDATE marketplace_orders SET
    status = 'shipped',
    tracking_number = p_tracking_number,
    tracking_url = p_tracking_url,
    shipped_at = now(),
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION market_mark_shipped(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION market_mark_shipped(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- market_mark_delivered — buyer confirms receipt (or pickup happened).
-- paid -> delivered covers pickup orders with no shipping leg; shipped ->
-- delivered covers tracked shipments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION market_mark_delivered(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid := current_profile_id();
  v_order marketplace_orders%ROWTYPE;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_order FROM marketplace_orders
    WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.buyer_id <> v_buyer THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status NOT IN ('paid','shipped') THEN
    RAISE EXCEPTION 'order is % — cannot mark delivered', v_order.status;
  END IF;
  UPDATE marketplace_orders SET
    status = 'delivered',
    delivered_at = now(),
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION market_mark_delivered(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION market_mark_delivered(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- market_cancel_order — buyer cancels an unpaid order. Paid orders need a
-- Stripe refund (dashboard/manual for v1 — documented, not automated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION market_cancel_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid := current_profile_id();
  v_order marketplace_orders%ROWTYPE;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_order FROM marketplace_orders
    WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.buyer_id <> v_buyer THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'order is % — only unpaid orders can be cancelled',
      v_order.status;
  END IF;
  UPDATE marketplace_orders SET
    status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION market_cancel_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION market_cancel_order(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- market-photos storage bucket — public read (listing photos are meant to
-- be seen), writes restricted to the uploader's own folder. Path layout:
--   market-photos/<seller_profile_id>/<uuid>.<ext>
-- The folder name is the seller's profile id, enforced by the storage
-- policy below — a user can only write under their own id.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-photos', 'market-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "market photos public read" ON storage.objects;
CREATE POLICY "market photos public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'market-photos');

DROP POLICY IF EXISTS "market photos write own folder" ON storage.objects;
CREATE POLICY "market photos write own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'market-photos'
    AND (storage.foldername(name))[1] = current_profile_id()::text
  );

DROP POLICY IF EXISTS "market photos update own folder" ON storage.objects;
CREATE POLICY "market photos update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'market-photos'
    AND (storage.foldername(name))[1] = current_profile_id()::text
  );

DROP POLICY IF EXISTS "market photos delete own folder" ON storage.objects;
CREATE POLICY "market photos delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'market-photos'
    AND (storage.foldername(name))[1] = current_profile_id()::text
  );
