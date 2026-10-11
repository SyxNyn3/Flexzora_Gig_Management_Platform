-- Crew OS #5: GrubRun — pooled food orders with cutoff times.
--
-- A runner posts a food run for a shift (restaurant + order cutoff); workers
-- place orders before the cutoff; the runner confirms each order with the
-- actual price — that's the moment the crew_iou (kind='food',
-- beneficiary=runner, group=run) is minted, because the debt isn't real
-- until the runner knows what it cost.
--
--   place    : worker posts order while run is open AND before the cutoff
--   confirm  : runner sets the real price_cents -> IOU mints
--   cancel   : worker cancels while 'placed'; runner/company cancels anytime
--   run done : 'ordered' (runner placed it) -> 'delivered'
--   run/shift cancel: orders close, committed IOUs void

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'food_run_status') THEN
    CREATE TYPE food_run_status AS ENUM ('open', 'ordered', 'delivered', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'food_order_status') THEN
    CREATE TYPE food_order_status AS ENUM ('placed', 'confirmed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS food_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  runner_worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restaurant text NOT NULL,
  menu_link text,
  order_cutoff_at timestamptz NOT NULL,
  delivery_area text,                     -- "meet at Dock B at 18:30"
  notes text,
  status food_run_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_runs_shift_idx ON food_runs (shift_id, status);
CREATE INDEX IF NOT EXISTS food_runs_runner_idx ON food_runs (runner_worker_id);

CREATE TABLE IF NOT EXISTS food_run_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES food_runs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item text NOT NULL,                     -- "#4 no onions, extra napkins"
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),  -- set by runner on confirm
  status food_order_status NOT NULL DEFAULT 'placed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, worker_id)              -- one order per worker per run
);

CREATE INDEX IF NOT EXISTS food_run_orders_run_idx ON food_run_orders (run_id, status);
CREATE INDEX IF NOT EXISTS food_run_orders_worker_idx ON food_run_orders (worker_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_food_run_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.runner_worker_id <> OLD.runner_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Run runner and shift are immutable';
  END IF;
  IF OLD.runner_worker_id <> current_profile_id()
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this food run';
  END IF;
  IF OLD.status IN ('cancelled', 'delivered') THEN RAISE EXCEPTION 'Closed runs cannot be changed'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_runs_guard ON food_runs;
CREATE TRIGGER food_runs_guard BEFORE UPDATE ON food_runs
  FOR EACH ROW EXECUTE FUNCTION guard_food_run_update();

DROP TRIGGER IF EXISTS food_runs_touch ON food_runs;
CREATE TRIGGER food_runs_touch BEFORE UPDATE ON food_runs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Orders: worker edits/cancels while 'placed'; the runner confirms (sets the
-- real price) or cancels any order; the hiring company cancels too.
CREATE OR REPLACE FUNCTION guard_food_order_update() RETURNS trigger AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.worker_id <> OLD.worker_id OR NEW.run_id <> OLD.run_id THEN
    RAISE EXCEPTION 'Order worker and run are immutable';
  END IF;

  SELECT * INTO v_run FROM food_runs WHERE id = OLD.run_id;

  IF OLD.worker_id = current_profile_id() THEN
    IF OLD.status <> 'placed' THEN RAISE EXCEPTION 'Only placed orders can be changed'; END IF;
    IF NOT (NEW.status = OLD.status OR NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Workers can only edit or cancel a placed order';
    END IF;
    IF NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
      RAISE EXCEPTION 'Only the runner sets the price';
    END IF;
    -- late edits still respect the cutoff the runner set
    IF NEW.status = 'placed' AND v_run.order_cutoff_at < now() THEN
      RAISE EXCEPTION 'The order cutoff has passed';
    END IF;
    RETURN NEW;
  END IF;

  IF v_run.runner_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id)) THEN
    -- runner confirms by setting price + status; may also edit notes/cancel
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled orders cannot be changed'; END IF;
    IF NEW.status = 'confirmed' AND (NEW.price_cents IS NULL OR NEW.price_cents <= 0) THEN
      RAISE EXCEPTION 'Confirmed orders need a real price';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not a party to this order';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_run_orders_guard ON food_run_orders;
CREATE TRIGGER food_run_orders_guard BEFORE UPDATE ON food_run_orders
  FOR EACH ROW EXECUTE FUNCTION guard_food_order_update();

DROP TRIGGER IF EXISTS food_run_orders_touch ON food_run_orders;
CREATE TRIGGER food_run_orders_touch BEFORE UPDATE ON food_run_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Placement validation: run must be open, before the cutoff (runner exempt —
-- they can phone an order in for someone), one order per worker (UNIQUE).
CREATE OR REPLACE FUNCTION check_food_order() RETURNS trigger AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.status <> 'placed' THEN RETURN NEW; END IF;

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

DROP TRIGGER IF EXISTS food_run_orders_check ON food_run_orders;
CREATE TRIGGER food_run_orders_check BEFORE INSERT ON food_run_orders
  FOR EACH ROW EXECUTE FUNCTION check_food_order();

-- Confirm mints the food IOU; cancelling a confirmed order voids it.
CREATE OR REPLACE FUNCTION sync_food_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.status = 'confirmed' THEN
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

DROP TRIGGER IF EXISTS food_run_orders_sync ON food_run_orders;
CREATE TRIGGER food_run_orders_sync AFTER UPDATE ON food_run_orders
  FOR EACH ROW EXECUTE FUNCTION sync_food_order();

-- Run cancelled: orders close, committed group IOUs void.
CREATE OR REPLACE FUNCTION cascade_food_run_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE food_run_orders SET status = 'cancelled', updated_at = now()
     WHERE run_id = NEW.id AND status IN ('placed', 'confirmed');
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id IN (SELECT id FROM food_run_orders WHERE run_id = NEW.id)
       AND status = 'committed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_runs_cascade_cancel ON food_runs;
CREATE TRIGGER food_runs_cascade_cancel AFTER UPDATE OF status ON food_runs
  FOR EACH ROW EXECUTE FUNCTION cascade_food_run_cancel();

-- Shift cancelled: runs die with it; crew_iou voids via the shift triggers.
CREATE OR REPLACE FUNCTION cascade_food_on_shift_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE food_runs SET status = 'cancelled', updated_at = now()
     WHERE shift_id = NEW.id AND status IN ('open', 'ordered');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_cancel_food_runs ON shifts;
CREATE TRIGGER shifts_cancel_food_runs AFTER UPDATE OF status ON shifts
  FOR EACH ROW EXECUTE FUNCTION cascade_food_on_shift_cancel();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE food_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_run_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food runs visible with shift" ON food_runs;
CREATE POLICY "food runs visible with shift" ON food_runs FOR SELECT TO authenticated
  USING (worker_can_see_shift(shift_id)
     OR runner_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = food_runs.shift_id)));

DROP POLICY IF EXISTS "runners post own runs" ON food_runs;
CREATE POLICY "runners post own runs" ON food_runs FOR INSERT TO authenticated
  WITH CHECK (runner_worker_id = current_profile_id() AND status = 'open');

DROP POLICY IF EXISTS "parties update runs" ON food_runs;
CREATE POLICY "parties update runs" ON food_runs FOR UPDATE TO authenticated
  USING (runner_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = food_runs.shift_id)));

-- everyone who can see the run's shift sees the orders (who wants what)
DROP POLICY IF EXISTS "orders visible with run" ON food_run_orders;
CREATE POLICY "orders visible with run" ON food_run_orders FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR EXISTS (
          SELECT 1 FROM food_runs r
          WHERE r.id = food_run_orders.run_id
            AND (r.runner_worker_id = current_profile_id()
                 OR worker_can_see_shift(r.shift_id)
                 OR owns_event((SELECT event_id FROM shifts WHERE id = r.shift_id)))));

DROP POLICY IF EXISTS "workers place own orders" ON food_run_orders;
CREATE POLICY "workers place own orders" ON food_run_orders FOR INSERT TO authenticated
  WITH CHECK (worker_id = current_profile_id() AND status = 'placed');

DROP POLICY IF EXISTS "parties update orders" ON food_run_orders;
CREATE POLICY "parties update orders" ON food_run_orders FOR UPDATE TO authenticated
  USING (worker_id = current_profile_id()
     OR current_profile_id() = (SELECT runner_worker_id FROM food_runs WHERE id = food_run_orders.run_id)
     OR owns_event((SELECT s.event_id FROM shifts s
                    JOIN food_runs r ON r.shift_id = s.id WHERE r.id = food_run_orders.run_id)));
