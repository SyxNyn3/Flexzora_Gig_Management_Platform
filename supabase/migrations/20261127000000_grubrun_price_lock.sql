-- Red-team #52 — GrubRun price lock at claim.
--
-- Today the orderer places an order with no price; the runner later confirms
-- at ANY price_cents and that amount mints a payout-deduction crew_iou — an
-- unbounded charge the orderer never agreed to (verified).
--
-- Fix (backlog): the orderer commits a quoted price at claim time; the runner
-- may confirm up to quoted × (1 + variance); above the variance threshold the
-- order moves to 'price_review' and only the ORDERER can accept (then the IOU
-- mints) or bounce it back to 'placed' for a re-quote.
--
--   quoted_price_cents  — orderer's committed menu price (required on insert)
--   'price_review'      — runner quoted above variance; awaits orderer
--   crew_settings.grubrun.price_variance_pct — variance threshold (default 25)

ALTER TYPE food_order_status ADD VALUE IF NOT EXISTS 'price_review';

ALTER TABLE food_run_orders
  ADD COLUMN IF NOT EXISTS quoted_price_cents integer
    CHECK (quoted_price_cents IS NULL OR quoted_price_cents >= 0);

INSERT INTO crew_settings (key, value)
VALUES ('grubrun', '{"price_variance_pct": 25}')
ON CONFLICT (key) DO NOTHING;

-- Max price a runner may confirm without orderer review. NULL quote means a
-- pre-lock legacy order — still uncapped (runner can't be retro-frozen), but
-- all new orders carry a quote.
CREATE OR REPLACE FUNCTION food_price_cap_cents(p_quoted integer)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE WHEN p_quoted IS NULL THEN NULL
              ELSE CEIL(p_quoted *
                   (1 + COALESCE((SELECT (value ->> 'price_variance_pct')::numeric
                                    FROM crew_settings WHERE key = 'grubrun'), 25) / 100))::integer
         END;
$$;

-- New orders must commit a quote (checked inside the existing placement gate).
CREATE OR REPLACE FUNCTION check_food_order() RETURNS trigger AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.status <> 'placed' THEN RETURN NEW; END IF;
  IF NEW.quoted_price_cents IS NULL OR NEW.quoted_price_cents < 0 THEN
    RAISE EXCEPTION 'Orders need a quoted price — that is the number the runner may not quietly exceed';
  END IF;

  SELECT * INTO v_run FROM food_runs WHERE id = NEW.run_id;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'Food run not found'; END IF;
  IF v_run.status <> 'open' THEN RAISE EXCEPTION 'This food run is %', v_run.status; END IF;
  IF NEW.worker_id = v_run.runner_worker_id THEN RAISE EXCEPTION 'Runner does not order from themselves'; END IF;
  IF v_run.order_cutoff_at < now() AND current_profile_id() <> v_run.runner_worker_id THEN
    RAISE EXCEPTION 'The order cutoff has passed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Order guard: the orderer edits/cancels 'placed' and may bail out of a
-- 'price_review' by cancelling — accept/reject ride the RPCs below (the
-- review flag is system-managed). The runner confirms ≤ cap or escalates to
-- 'price_review'; a direct confirm above the cap throws.
CREATE OR REPLACE FUNCTION guard_food_order_update() RETURNS trigger AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.worker_id <> OLD.worker_id OR NEW.run_id <> OLD.run_id THEN
    RAISE EXCEPTION 'Order worker and run are immutable';
  END IF;
  IF NEW.quoted_price_cents IS DISTINCT FROM OLD.quoted_price_cents THEN
    RAISE EXCEPTION 'The quoted price is locked once the order is placed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_run FROM food_runs WHERE id = OLD.run_id;

  IF OLD.worker_id = current_profile_id() THEN
    IF OLD.status = 'price_review' THEN
      -- accept/reject are RPC-driven; the orderer may still walk away
      IF NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Price review replies go through accept/reject' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status <> 'placed' THEN RAISE EXCEPTION 'Only placed orders can be changed'; END IF;
    IF NOT (NEW.status = OLD.status OR NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Workers can only edit or cancel a placed order';
    END IF;
    IF NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
      RAISE EXCEPTION 'Only the runner sets the price';
    END IF;
    IF NEW.status = 'placed' AND v_run.order_cutoff_at < now() THEN
      RAISE EXCEPTION 'The order cutoff has passed';
    END IF;
    RETURN NEW;
  END IF;

  IF v_run.runner_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id)) THEN
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled orders cannot be changed'; END IF;
    IF NEW.status = 'confirmed' THEN
      IF NEW.price_cents IS NULL OR NEW.price_cents <= 0 THEN
        RAISE EXCEPTION 'Confirmed orders need a real price';
      END IF;
      IF food_price_cap_cents(OLD.quoted_price_cents) IS NOT NULL
         AND NEW.price_cents > food_price_cap_cents(OLD.quoted_price_cents) THEN
        RAISE EXCEPTION 'Above the quoted-price variance — send it to the orderer for review'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NEW.status = 'price_review'
       AND (NEW.price_cents IS NULL
            OR food_price_cap_cents(OLD.quoted_price_cents) IS NULL
            OR NEW.price_cents <= food_price_cap_cents(OLD.quoted_price_cents)) THEN
      RAISE EXCEPTION 'Review is only for quotes above the variance threshold';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not a party to this order';
END;
$$ LANGUAGE plpgsql;

-- Runner confirm: picks 'confirmed' vs 'price_review' by the cap so the
-- client needs no threshold math. Returns the resulting status.
CREATE OR REPLACE FUNCTION confirm_food_order(p_order uuid, p_price_cents integer)
RETURNS food_order_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_order food_run_orders%ROWTYPE;
  v_run   food_runs%ROWTYPE;
  v_next  food_order_status;
BEGIN
  SELECT * INTO v_order FROM food_run_orders WHERE id = p_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT * INTO v_run FROM food_runs WHERE id = v_order.run_id;
  IF v_run.runner_worker_id <> current_profile_id()
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this order' USING ERRCODE = '42501';
  END IF;
  IF v_order.status <> 'placed' THEN RAISE EXCEPTION 'Order is %', v_order.status; END IF;
  IF p_price_cents IS NULL OR p_price_cents <= 0 THEN RAISE EXCEPTION 'Price must be positive'; END IF;

  v_next := CASE WHEN food_price_cap_cents(v_order.quoted_price_cents) IS NULL
                   OR p_price_cents <= food_price_cap_cents(v_order.quoted_price_cents)
                 THEN 'confirmed'::food_order_status
                 ELSE 'price_review'::food_order_status END;

  UPDATE food_run_orders SET status = v_next, price_cents = p_price_cents, updated_at = now()
   WHERE id = p_order;

  IF v_next = 'price_review' THEN
    INSERT INTO crew_alerts (worker_id, kind, title, body, href)
    VALUES (v_order.worker_id, ('iou',
            'Food order price is higher than quoted',
            v_run.restaurant || ': "' || left(v_order.item, 60) || '" came to $' ||
              round(p_price_cents / 100.0, 2) || ' — accept or bounce it back',
            '/crew');
  END IF;
  RETURN v_next;
END;
$$;

-- Orderer accepts the above-variance quote → confirmed → IOU mints.
CREATE OR REPLACE FUNCTION accept_food_price(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_order food_run_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM food_run_orders WHERE id = p_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.worker_id <> current_profile_id() THEN
    RAISE EXCEPTION 'Only the orderer can accept the price' USING ERRCODE = '42501';
  END IF;
  IF v_order.status <> 'price_review' THEN RAISE EXCEPTION 'Order is %', v_order.status; END IF;
  UPDATE food_run_orders SET status = 'confirmed', updated_at = now() WHERE id = p_order;
END;
$$;

-- Orderer bounces the quote back → 'placed' with the price cleared so the
-- runner can re-quote (or the orderer can cancel outright).
CREATE OR REPLACE FUNCTION reject_food_price(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_order food_run_orders%ROWTYPE;
  v_run   food_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM food_run_orders WHERE id = p_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT * INTO v_run FROM food_runs WHERE id = v_order.run_id;
  IF v_order.worker_id <> current_profile_id() THEN
    RAISE EXCEPTION 'Only the orderer can reject the price' USING ERRCODE = '42501';
  END IF;
  IF v_order.status <> 'price_review' THEN RAISE EXCEPTION 'Order is %', v_order.status; END IF;
  UPDATE food_run_orders SET status = 'placed', price_cents = NULL, updated_at = now() WHERE id = p_order;
  INSERT INTO crew_alerts (worker_id, kind, title, body, href)
  VALUES (v_run.runner_worker_id, ('iou',
          'Food price bounced back',
          '"' || left(v_order.item, 60) || '" — the orderer didn''t accept $' ||
            round(v_order.price_cents / 100.0, 2) || '; re-quote or cancel',
          '/crew');
END;
$$;
