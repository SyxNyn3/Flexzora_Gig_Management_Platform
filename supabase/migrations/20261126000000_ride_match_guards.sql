-- Red-team ride-match batch (#25, #26, #27).
--
-- #25 — no uniqueness on live requests: a rider could hold N open requests
--        and match seats across multiple offers. Partial unique index pins
--        one live request per rider per shift (withdrawn/cancelled reopen).
--
-- #26 — the company branch bypassed every status rule: owns_event could
--        flip a request to 'matched' and set offer_id — force-committing a
--        rider's seat + minting their gas IOU. Company now may only cancel
--        (moderation), never drive the state machine.
--
-- #27 — a matched rider could edit seats_needed / re-point offer_id,
--        desyncing the seat ledger (withdraw decrements OLD.seats_needed).
--        seats_needed locks at match; offer_id is always system-managed.

CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_live_rider_uq
  ON ride_requests (rider_worker_id, shift_id)
  WHERE status IN ('open', 'matched');

CREATE OR REPLACE FUNCTION guard_ride_request_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.rider_worker_id <> OLD.rider_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Request rider and shift are immutable';
  END IF;
  -- matching is system work — the match trigger owns offer_id
  IF NEW.offer_id IS DISTINCT FROM OLD.offer_id THEN
    RAISE EXCEPTION 'offer_id is system-managed' USING ERRCODE = '42501';
  END IF;
  IF OLD.rider_worker_id = current_profile_id() THEN
    IF OLD.status IN ('withdrawn', 'cancelled') THEN
      RAISE EXCEPTION 'Closed requests cannot be changed';
    END IF;
    -- #27: the seat ledger accounts in units of seats_needed once matched
    IF OLD.status = 'matched' AND NEW.seats_needed IS DISTINCT FROM OLD.seats_needed THEN
      RAISE EXCEPTION 'Seats needed locks once matched' USING ERRCODE = '42501';
    END IF;
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'open'    AND NEW.status IN ('matched', 'withdrawn'))
         OR (OLD.status = 'matched' AND NEW.status = 'withdrawn')) THEN
      RAISE EXCEPTION 'Rider cannot move request from % to %', OLD.status, NEW.status;
    END IF;
  ELSIF owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    -- #26: moderation only — never move requests on a rider's behalf
    IF NEW.status <> 'cancelled' OR OLD.status IN ('cancelled', 'withdrawn') THEN
      RAISE EXCEPTION 'Company can only cancel open requests' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this ride request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
