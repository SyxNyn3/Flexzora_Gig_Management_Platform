-- Order listing snapshot: once a listing sells, marketplace_listings RLS
-- hides it from the buyer (status flips to 'sold'), so the order embed
-- returned NULL and the orders page rendered "Deleted listing". Snapshot
-- the display fields onto the order at creation — they survive sell,
-- edit, and deletion.

ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS listing_title text,
  ADD COLUMN IF NOT EXISTS listing_photo text;

-- Backfill existing orders from their listings where still visible.
UPDATE public.marketplace_orders o
SET listing_title = l.title,
    listing_photo = l.photo_paths->>0
FROM public.marketplace_listings l
WHERE l.id = o.listing_id
  AND o.listing_title IS NULL;

CREATE OR REPLACE FUNCTION public.market_create_order(p_listing_id uuid, p_fulfillment text, p_shipping_address jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     fulfillment, shipping_address, listing_title, listing_photo)
  VALUES
    (v_listing.id, v_buyer, v_listing.seller_id, v_listing.price_cents,
     v_fee, p_fulfillment, p_shipping_address,
     v_listing.title, v_listing.photo_paths->>0)
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$function$;
