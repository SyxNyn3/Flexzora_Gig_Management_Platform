-- ============================================================================
-- Crew marketplace follow-up: one open order per listing
-- ============================================================================
-- Without this, two buyers can each create an order on the same listing and
-- both check out — the second payment would take money for an item already
-- sold. A partial unique index allows at most one order in a live state
-- (pending_payment / paid / shipped / delivered) per listing. Cancelled and
-- disputed orders don't block a relisting flow.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_one_open_per_listing
  ON marketplace_orders (listing_id)
  WHERE status IN ('pending_payment','paid','shipped','delivered');

-- Friendly pre-check so buyers get "already has an open order" instead of a
-- raw unique-violation. Same body as 20261216000000 plus the open-order
-- lookup before INSERT.
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
  IF EXISTS (
    SELECT 1 FROM marketplace_orders
    WHERE listing_id = p_listing_id
      AND status IN ('pending_payment','paid','shipped','delivered')
  ) THEN
    RAISE EXCEPTION 'this listing already has an open order';
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
