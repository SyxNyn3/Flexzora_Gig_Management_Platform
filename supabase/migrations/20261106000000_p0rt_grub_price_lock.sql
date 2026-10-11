-- P0-RT #52 — the runner could confirm an order at any price, and the orderer's
-- debt minted at that price. A $500 "burrito" would be deducted from the
-- orderer's payout with nobody checking it.
--
-- Fix (per the itinerary: lock the price at confirmation; the orderer confirms
-- above a variance threshold):
--   * A confirmed order's price and item are locked. Only a cancellation (by the
--     runner or the company) can change a confirmed order afterwards.
--   * Up to food_auto_accept_cap_cents() (default $25 per order) the orderer's
--     consent is implied at confirmation, so routine runs stay one tap.
--   * Above it, the order waits for the orderer to accept the price. The debt
--     mints only when price_accepted_at is set — same consent pattern as the
--     board-post fix (#19).
--   * Only the orderer can set price_accepted_at; the runner cannot.
--
-- Deeper follow-up (BACKLOG): per-menu quotes so the threshold is relative to
-- the actual menu price instead of one flat cap.
--
-- Additive + idempotent. Orders already minted before this migration are
-- grandfathered (price_accepted_at backfilled) and are never re-minted.

ALTER TABLE food_run_orders ADD COLUMN IF NOT EXISTS price_accepted_at timestamptz;

-- Grandfather: confirmed orders that already minted are treated as accepted.
UPDATE food_run_orders o
   SET price_accepted_at = coalesce(o.updated_at, o.created_at, now())
 WHERE o.status = 'confirmed'
   AND o.price_accepted_at IS NULL
   AND EXISTS (SELECT 1 FROM crew_iou i WHERE i.iou_group_id = o.id);

CREATE OR REPLACE FUNCTION food_auto_accept_cap_cents() RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT 2500 $$;

CREATE OR REPLACE FUNCTION guard_food_order_update() RETURNS trigger AS $$
DECLARE
  v_run food_runs%ROWTYPE;
  v_me uuid := current_profile_id();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.worker_id <> OLD.worker_id OR NEW.run_id <> OLD.run_id THEN
    RAISE EXCEPTION 'Order worker and run are immutable';
  END IF;

  SELECT * INTO v_run FROM food_runs WHERE id = OLD.run_id;

  -- #52 a confirmed order's price is locked. Only the orderer's consent (above the
  -- cap) and a cancellation by the runner or company can move it.
  IF OLD.status = 'confirmed' THEN
    IF NEW.price_cents IS DISTINCT FROM OLD.price_cents OR NEW.item IS DISTINCT FROM OLD.item THEN
      RAISE EXCEPTION 'Confirmed prices are locked';
    END IF;
    IF NEW.price_accepted_at IS DISTINCT FROM OLD.price_accepted_at THEN
      IF v_me IS DISTINCT FROM OLD.worker_id OR OLD.price_accepted_at IS NOT NULL
         OR NEW.price_accepted_at IS NULL OR NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Only the orderer can accept a confirmed price';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.status = 'cancelled'
       AND (v_run.runner_worker_id = v_me OR owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id))) THEN
      RETURN NEW;
    END IF;
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Confirmed orders can only be cancelled';
  END IF;

  IF OLD.worker_id = v_me THEN
    IF OLD.status <> 'placed' THEN RAISE EXCEPTION 'Only placed orders can be changed'; END IF;
    IF NOT (NEW.status = OLD.status OR NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Workers can only edit or cancel a placed order';
    END IF;
    IF NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
      RAISE EXCEPTION 'Only the runner sets the price';
    END IF;
    IF NEW.price_accepted_at IS DISTINCT FROM OLD.price_accepted_at THEN
      RAISE EXCEPTION 'Only the orderer accepts a confirmed price';
    END IF;
    -- late edits still respect the cutoff the runner set
    IF NEW.status = 'placed' AND v_run.order_cutoff_at < now() THEN
      RAISE EXCEPTION 'The order cutoff has passed';
    END IF;
    RETURN NEW;
  END IF;

  IF v_run.runner_worker_id = v_me
     OR owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id)) THEN
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled orders cannot be changed'; END IF;
    -- the runner can never set consent directly
    IF NEW.price_accepted_at IS DISTINCT FROM OLD.price_accepted_at THEN
      RAISE EXCEPTION 'Only the orderer accepts a confirmed price';
    END IF;
    IF NEW.status = 'confirmed' THEN
      IF NEW.price_cents IS NULL OR NEW.price_cents <= 0 THEN
        RAISE EXCEPTION 'Confirmed orders need a real price';
      END IF;
      -- under the cap consent is implied; above it the orderer must accept
      NEW.price_accepted_at := CASE WHEN NEW.price_cents <= food_auto_accept_cap_cents() THEN now() ELSE NULL END;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not a party to this order';
END;
$$ LANGUAGE plpgsql;

-- The debt mints when consent lands on a confirmed order, not when the runner
-- confirms the price.
CREATE OR REPLACE FUNCTION sync_food_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND NEW.price_accepted_at IS NOT NULL
     AND OLD.price_accepted_at IS NULL THEN
    SELECT * INTO v_run FROM food_runs WHERE id = NEW.run_id;
    INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                          beneficiary_worker_id, iou_group_id, notes)
    VALUES (NEW.worker_id, v_run.shift_id, 'food', NEW.price_cents,
            v_run.runner_worker_id, NEW.id,
            'GrubRun — ' || v_run.restaurant || ': ' || left(NEW.item, 80));
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = OLD.id AND status = 'committed';
  END IF;
  RETURN NEW;
END $$;

-- INSERT side of the same consent gate: a worker-supplied price_accepted_at on
-- a new order would sit in OLD on the confirm update, so the consent-mint
-- (`OLD.price_accepted_at IS NULL`) would never fire — the orderer eats free.
-- Same pre-stamp dodge the board fix closed on crew_posts. Force it null at
-- insert for API writers; definer paths bypass the check.
CREATE OR REPLACE FUNCTION check_food_order() RETURNS trigger AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.status <> 'placed' THEN RETURN NEW; END IF;
  NEW.price_accepted_at := NULL;

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
