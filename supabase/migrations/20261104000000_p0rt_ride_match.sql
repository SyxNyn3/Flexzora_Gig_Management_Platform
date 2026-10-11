-- P0-RT Lane A — ride-match MED batch (#25, #26, #27).
--
--   #25  nothing stopped one rider holding several ACTIVE ride requests on the
--        same shift, so a single rider could take seats and mint gas-share IOUs
--        on several offers. A partial unique index over active (rider, shift)
--        rows closes it race-free. Closed requests (withdrawn/cancelled) do not
--        count, so a rider can still rejoin after bailing.
--   #26  the company branch of the request guard accepted any status change, so
--        the hiring company could force a 'matched' — a gas-share debt the rider
--        never agreed to. Companies may now only cancel a request, and may not
--        reassign its offer.
--   #27  seats_needed could change after a match, but the seats taken on the
--        offer and the minted gas-share IOU were sized from the old value. Seats
--        now freeze once matched; a rider who wants a different count withdraws
--        and rejoins.
--
-- Additive + idempotent. If production already holds two active requests from
-- one rider on one shift, the unique index creation fails loudly. Resolving
-- that is a human decision (withdraw the extra), so it is not done here.

CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_one_active_per_rider_shift
  ON ride_requests (rider_worker_id, shift_id)
  WHERE status IN ('open', 'matched');

CREATE OR REPLACE FUNCTION guard_ride_request_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.rider_worker_id <> OLD.rider_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Request rider and shift are immutable';
  END IF;

  -- #27 seats are fixed once matched: the offer's seat ledger and the minted
  -- gas-share IOU are both sized from them.
  IF OLD.status = 'matched' AND NEW.seats_needed IS DISTINCT FROM OLD.seats_needed THEN
    RAISE EXCEPTION 'Seats cannot change once matched — withdraw and rejoin instead';
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
  -- #26 the hiring company may cancel a request, never match one for a rider.
  ELSIF owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    IF NOT (NEW.status = OLD.status
            OR (OLD.status IN ('open', 'matched') AND NEW.status = 'cancelled'))
       OR NEW.offer_id IS DISTINCT FROM OLD.offer_id THEN
      RAISE EXCEPTION 'Companies can only cancel ride requests — matching needs the rider';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this ride request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
