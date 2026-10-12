-- Red-team singles batch: #21, #30, #31.
--
-- #21 — timesheets.break_minutes had no floor: a worker could submit a
--        negative break and INFLATE payable hours (verified, pre-existing).
--
-- #30 — every crew-table INSERT only checked self-ownership: a worker could
--        squat ride requests/offers, food orders/runs, and lodging pools on
--        shifts they aren't booked on — minting phantom IOUs (a food IOU even
--        carries to the worker's NEXT timesheet on any shift). Gate: a live
--        assignment (offered/confirmed) on the shift is required to post.
--
-- #31 — "Ride cancelled" alert was dead code: the BEFORE cascade flipped
--        matched requests to 'open' before the AFTER trigger read them, so
--        `WHERE status='matched'` always selected zero rows. Alert now
--        inserts inside the BEFORE path, before the flip.

-- #21 — already on main as timesheets_break_minutes_floor (20261105); the
--        095 test asserts the check-violation, which that constraint raises.

-- #30 ------------------------------------------------------------------------
-- One shared predicate: booked = a live assignment on the shift. 'offered'
-- counts (crew planning starts pre-confirm); terminal states don't.
CREATE OR REPLACE FUNCTION worker_booked_on_shift(p_shift_id uuid, p_worker_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM shift_assignments
     WHERE shift_id = p_shift_id AND worker_id = p_worker_id
       AND status IN ('offered', 'confirmed')
  );
$$;

CREATE OR REPLACE FUNCTION check_crew_booking() RETURNS trigger AS $$
DECLARE
  v_row     jsonb := to_jsonb(NEW);
  v_shift   uuid;
  v_worker  uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  v_worker := COALESCE(
    (v_row ->> 'rider_worker_id')::uuid,
    (v_row ->> 'driver_worker_id')::uuid,
    (v_row ->> 'runner_worker_id')::uuid,
    (v_row ->> 'host_worker_id')::uuid,
    (v_row ->> 'worker_id')::uuid);
  v_shift  := COALESCE(
    (v_row ->> 'shift_id')::uuid,
    (SELECT r.shift_id FROM food_runs r WHERE r.id = (v_row ->> 'run_id')::uuid),
    (SELECT p.shift_id FROM lodging_pools p WHERE p.id = (v_row ->> 'pool_id')::uuid));

  -- only the worker posting for themselves needs the gate (company/definer
  -- paths and rows where the caller isn't the member pass)
  IF v_worker IS NULL OR v_worker <> current_profile_id() THEN RETURN NEW; END IF;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'Cannot resolve the shift for this crew entry'; END IF;

  IF NOT worker_booked_on_shift(v_shift, v_worker) THEN
    RAISE EXCEPTION 'You must be booked on this shift to use its crew board' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ride_requests_booking ON ride_requests;
CREATE TRIGGER ride_requests_booking BEFORE INSERT ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION check_crew_booking();
DROP TRIGGER IF EXISTS ride_offers_booking ON ride_offers;
CREATE TRIGGER ride_offers_booking BEFORE INSERT ON ride_offers
  FOR EACH ROW EXECUTE FUNCTION check_crew_booking();
DROP TRIGGER IF EXISTS food_run_orders_booking ON food_run_orders;
CREATE TRIGGER food_run_orders_booking BEFORE INSERT ON food_run_orders
  FOR EACH ROW EXECUTE FUNCTION check_crew_booking();
DROP TRIGGER IF EXISTS food_runs_booking ON food_runs;
CREATE TRIGGER food_runs_booking BEFORE INSERT ON food_runs
  FOR EACH ROW EXECUTE FUNCTION check_crew_booking();
DROP TRIGGER IF EXISTS lodging_pools_booking ON lodging_pools;
CREATE TRIGGER lodging_pools_booking BEFORE INSERT ON lodging_pools
  FOR EACH ROW EXECUTE FUNCTION check_crew_booking();
DROP TRIGGER IF EXISTS pool_members_booking ON pool_members;
CREATE TRIGGER pool_members_booking BEFORE INSERT ON pool_members
  FOR EACH ROW EXECUTE FUNCTION check_crew_booking();

-- #31 ------------------------------------------------------------------------
-- The cancel alert moves into the BEFORE cascade: collect the matched riders,
-- alert them, THEN flip them back to the pool.
CREATE OR REPLACE FUNCTION cascade_ride_offer_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM set_config('app.offer_cancel_cascade', 'on', true);
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    SELECT r.rider_worker_id, r.shift_id, 'pool',
      'Ride cancelled',
      'Your ride offer was cancelled — re-check the crew board for other rides.',
      r.id,
      'alert:ride-cancelled:' || r.id::text
    FROM ride_requests r
    WHERE r.offer_id = NEW.id AND r.status = 'matched'
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    UPDATE ride_requests
       SET status = 'open', offer_id = NULL, updated_at = now()
     WHERE offer_id = NEW.id AND status = 'matched';
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = NEW.id AND status = 'committed';
    NEW.seats_taken := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- the AFTER alert trigger is now redundant — its rows are always 'open' by then
DROP TRIGGER IF EXISTS crew_alert_on_ride_cancel ON ride_offers;
