-- Crew OS #2: CrewPool rides.
--
-- ride_offers  : a confirmed worker posts seats they're driving to a shift,
--                with an optional per-seat gas share in cents.
-- ride_requests: a worker posts that they need a ride (status 'open'), or
--                joins an offer (status 'matched', offer_id set). Matching is
--                a plain INSERT/UPDATE — triggers do the seat accounting and
--                mint the gas-share crew_iou so the debt is captured no matter
--                which client does the write.
--
-- Lifecycle rules:
--   match          -> offer.seats_taken += seats_needed; offer may flip 'full';
--                     crew_iou(ride, beneficiary=driver, group=offer) created
--   withdraw/cancel a matched request -> seat freed, offer reopens, IOU voids
--   cancel an offer -> IOUs void, matched requests return to 'open'
--   cancel/delete the shift -> offers + requests cancel; crew_iou already
--                     voids via the existing shift triggers
--   settle path    -> unchanged: approve_timesheet deducts the gas share from
--                     the rider's payout like any other IOU
--
-- needs_ride/can_drive flags on shift_assignments are the lightweight "I need
-- / can offer a ride" signal the board shows before anyone posts.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ride_offer_status') THEN
    CREATE TYPE ride_offer_status AS ENUM ('open', 'full', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ride_request_status') THEN
    CREATE TYPE ride_request_status AS ENUM ('open', 'matched', 'withdrawn', 'cancelled');
  END IF;
END $$;

-- need-ride / can-drive flags on the booking itself
ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS needs_ride boolean NOT NULL DEFAULT false;
ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS can_drive boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  driver_worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seats integer NOT NULL CHECK (seats > 0),
  seats_taken integer NOT NULL DEFAULT 0 CHECK (seats_taken >= 0 AND seats_taken <= seats),
  departure_area text,                    -- "Hotel lobby", "Pensacola", free text
  departure_at timestamptz,
  gas_share_cents integer NOT NULL DEFAULT 0 CHECK (gas_share_cents >= 0),
  notes text,
  status ride_offer_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_offers_shift_idx ON ride_offers (shift_id, status);
CREATE INDEX IF NOT EXISTS ride_offers_driver_idx ON ride_offers (driver_worker_id);

CREATE TABLE IF NOT EXISTS ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  rider_worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seats_needed integer NOT NULL DEFAULT 1 CHECK (seats_needed > 0),
  pickup_area text,
  notes text,
  status ride_request_status NOT NULL DEFAULT 'open',
  offer_id uuid REFERENCES ride_offers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_requests_shift_idx ON ride_requests (shift_id, status);
CREATE INDEX IF NOT EXISTS ride_requests_rider_idx ON ride_requests (rider_worker_id);
CREATE INDEX IF NOT EXISTS ride_requests_offer_idx ON ride_requests (offer_id);

-- ---------------------------------------------------------------------------
-- Guards — same pattern as the marketplace guards: the API role may only walk
-- the state machine from its own side; SECURITY DEFINER internals are exempt
-- via the current_user check.
-- ---------------------------------------------------------------------------

-- Allow definer internals (triggers/RPCs) to maintain crew_iou rows. This
-- mirrors guard_assignment_update's exemption and unblocks the ride cascades.
CREATE OR REPLACE FUNCTION guard_crew_iou_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF OLD.shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RETURN NEW;
  END IF;

  IF OLD.worker_id = v_me THEN
    IF OLD.status <> 'committed' THEN RAISE EXCEPTION 'Only committed IOUs can be changed'; END IF;
    IF NEW.status NOT IN ('committed', 'void') THEN RAISE EXCEPTION 'Workers cannot settle their own IOUs'; END IF;
    IF NEW.worker_id <> OLD.worker_id THEN RAISE EXCEPTION 'worker_id cannot change'; END IF;
    IF NEW.settled_at IS NOT NULL OR NEW.settled_timesheet_id IS NOT NULL THEN
      RAISE EXCEPTION 'Settlement fields are system-managed';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.beneficiary_worker_id = v_me AND NEW.beneficiary_worker_id = v_me THEN
    IF OLD.status <> 'committed' OR NEW.status <> 'settled' OR OLD.settle_via <> 'manual' THEN
      RAISE EXCEPTION 'Beneficiary can only mark manual IOUs settled';
    END IF;
    IF NEW.amount_cents <> OLD.amount_cents OR NEW.worker_id <> OLD.worker_id
       OR NEW.kind <> OLD.kind OR NEW.iou_group_id IS DISTINCT FROM OLD.iou_group_id THEN
      RAISE EXCEPTION 'Only status can change when settling a manual IOU';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not a party to this IOU';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION guard_ride_offer_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.driver_worker_id <> OLD.driver_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Offer driver and shift are immutable';
  END IF;
  IF NEW.seats < OLD.seats_taken THEN
    RAISE EXCEPTION 'Cannot reduce seats below % already taken', OLD.seats_taken;
  END IF;
  -- only the driver or the hiring company may touch an offer
  IF OLD.driver_worker_id <> current_profile_id()
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this ride offer';
  END IF;
  IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled offers cannot be changed'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ride_offers_guard ON ride_offers;
CREATE TRIGGER ride_offers_guard BEFORE UPDATE ON ride_offers
  FOR EACH ROW EXECUTE FUNCTION guard_ride_offer_update();

DROP TRIGGER IF EXISTS ride_offers_touch ON ride_offers;
CREATE TRIGGER ride_offers_touch BEFORE UPDATE ON ride_offers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Requests: the rider edits/withdraws; 'matched'/'cancelled' are reachable but
-- validated below; the hiring company may cancel anyone's request.
CREATE OR REPLACE FUNCTION guard_ride_request_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.rider_worker_id <> OLD.rider_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Request rider and shift are immutable';
  END IF;
  IF OLD.rider_worker_id = current_profile_id() THEN
    IF OLD.status IN ('withdrawn', 'cancelled') THEN
      RAISE EXCEPTION 'Closed requests cannot be changed';
    END IF;
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'open'    AND NEW.status IN ('matched', 'withdrawn'))
         OR (OLD.status = 'matched' AND NEW.status = 'withdrawn')) THEN
      RAISE EXCEPTION 'Rider cannot move request from % to %', OLD.status, NEW.status;
    END IF;
  ELSIF NOT owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this ride request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ride_requests_guard ON ride_requests;
CREATE TRIGGER ride_requests_guard BEFORE UPDATE ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION guard_ride_request_update();

DROP TRIGGER IF EXISTS ride_requests_touch ON ride_requests;
CREATE TRIGGER ride_requests_touch BEFORE UPDATE ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Validate a match attempt: offer must be open, on the same shift, not the
-- rider's own offer, with enough free seats.
CREATE OR REPLACE FUNCTION check_ride_match() RETURNS trigger AS $$
DECLARE
  v_offer ride_offers%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.status <> 'matched' OR NEW.offer_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_offer FROM ride_offers WHERE id = NEW.offer_id;
  IF v_offer.id IS NULL THEN RAISE EXCEPTION 'Ride offer not found'; END IF;
  IF v_offer.shift_id <> NEW.shift_id THEN RAISE EXCEPTION 'Offer is for a different shift'; END IF;
  IF v_offer.driver_worker_id = NEW.rider_worker_id THEN RAISE EXCEPTION 'Driver cannot ride their own offer'; END IF;
  IF v_offer.status = 'cancelled' THEN RAISE EXCEPTION 'Offer is cancelled'; END IF;
  IF v_offer.seats - v_offer.seats_taken < NEW.seats_needed THEN
    RAISE EXCEPTION 'Not enough seats left in this ride';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ride_requests_check_match ON ride_requests;
CREATE TRIGGER ride_requests_check_match BEFORE INSERT OR UPDATE ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION check_ride_match();

-- Seat + IOU bookkeeping. SECURITY DEFINER so a rider's match can update the
-- driver-owned offer and write the rider's IOU row; guard functions exempt
-- definer internals via current_user.
CREATE OR REPLACE FUNCTION sync_ride_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_offer ride_offers%ROWTYPE;
BEGIN
  -- new match: take seats + mint the gas-share IOU
  IF NEW.status = 'matched' AND NEW.offer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'matched' OR OLD.offer_id IS DISTINCT FROM NEW.offer_id) THEN
    SELECT * INTO v_offer FROM ride_offers WHERE id = NEW.offer_id FOR UPDATE;
    UPDATE ride_offers
       SET seats_taken = seats_taken + NEW.seats_needed,
           status = CASE WHEN seats_taken + NEW.seats_needed >= seats THEN 'full'::ride_offer_status ELSE status END
     WHERE id = v_offer.id;
    IF v_offer.gas_share_cents > 0 THEN
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, iou_group_id, notes)
      VALUES (NEW.rider_worker_id, NEW.shift_id, 'ride',
              v_offer.gas_share_cents * NEW.seats_needed,
              v_offer.driver_worker_id, v_offer.id,
              'Gas share — ride offer ' || v_offer.id);
    END IF;
  END IF;

  -- leaving a match (withdrawn, or switching offers): free seats, reopen the
  -- offer, void the rider's IOU for the old offer only
  IF TG_OP = 'UPDATE' AND OLD.status = 'matched' AND OLD.offer_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM 'matched' OR NEW.offer_id IS DISTINCT FROM OLD.offer_id) THEN
    UPDATE ride_offers
       SET seats_taken = GREATEST(seats_taken - OLD.seats_needed, 0),
           status = CASE WHEN status = 'full' THEN 'open'::ride_offer_status ELSE status END
     WHERE id = OLD.offer_id;
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = OLD.offer_id AND worker_id = OLD.rider_worker_id
       AND status = 'committed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ride_requests_sync ON ride_requests;
CREATE TRIGGER ride_requests_sync AFTER INSERT OR UPDATE ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION sync_ride_request();

-- Offer cancelled: void every committed IOU in the group, return matched
-- riders to the pool, reset the seat ledger.
CREATE OR REPLACE FUNCTION cascade_ride_offer_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE ride_requests
       SET status = 'open', offer_id = NULL, updated_at = now()
     WHERE offer_id = NEW.id AND status = 'matched';
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = NEW.id AND status = 'committed';
    NEW.seats_taken := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ride_offers_cascade_cancel ON ride_offers;
CREATE TRIGGER ride_offers_cascade_cancel BEFORE UPDATE ON ride_offers
  FOR EACH ROW EXECUTE FUNCTION cascade_ride_offer_cancel();

-- Shift cancelled/deleted: the rides die with it. crew_iou already voids via
-- the shifts_void_ious triggers; this is just readable final state.
CREATE OR REPLACE FUNCTION cascade_rides_on_shift_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE ride_requests SET status = 'cancelled', updated_at = now()
     WHERE shift_id = NEW.id AND status IN ('open', 'matched');
    UPDATE ride_offers SET status = 'cancelled', updated_at = now()
     WHERE shift_id = NEW.id AND status IN ('open', 'full');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_cancel_rides ON shifts;
CREATE TRIGGER shifts_cancel_rides AFTER UPDATE OF status ON shifts
  FOR EACH ROW EXECUTE FUNCTION cascade_rides_on_shift_cancel();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE ride_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the shift can see its ride board; the company too.
DROP POLICY IF EXISTS "ride offers visible with shift" ON ride_offers;
CREATE POLICY "ride offers visible with shift" ON ride_offers FOR SELECT TO authenticated
  USING (worker_can_see_shift(shift_id)
     OR driver_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = ride_offers.shift_id)));

DROP POLICY IF EXISTS "drivers post own offers" ON ride_offers;
CREATE POLICY "drivers post own offers" ON ride_offers FOR INSERT TO authenticated
  WITH CHECK (driver_worker_id = current_profile_id() AND status = 'open' AND seats_taken = 0);

DROP POLICY IF EXISTS "parties update offers" ON ride_offers;
CREATE POLICY "parties update offers" ON ride_offers FOR UPDATE TO authenticated
  USING (driver_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = ride_offers.shift_id)));

DROP POLICY IF EXISTS "ride requests visible with shift" ON ride_requests;
CREATE POLICY "ride requests visible with shift" ON ride_requests FOR SELECT TO authenticated
  USING (worker_can_see_shift(shift_id)
     OR rider_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = ride_requests.shift_id)));

-- riders post an open need, or join an offer directly (match validated by trigger)
DROP POLICY IF EXISTS "riders post own requests" ON ride_requests;
CREATE POLICY "riders post own requests" ON ride_requests FOR INSERT TO authenticated
  WITH CHECK (rider_worker_id = current_profile_id() AND status IN ('open', 'matched'));

DROP POLICY IF EXISTS "parties update requests" ON ride_requests;
CREATE POLICY "parties update requests" ON ride_requests FOR UPDATE TO authenticated
  USING (rider_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = ride_requests.shift_id)));
