-- Red-team #23: guard_assignment_update froze offer terms on the WORKER
-- branch only — the company could rewrite offered_rate after the worker
-- confirmed, silently changing the paycheck approve_timesheet computes
-- (COALESCE(offered_rate, hourly_rate)). Verified live.
--
-- The company may still negotiate while the booking is pending (applied /
-- offered / revive offers); once the worker commits (confirmed, completed,
-- no_show) the terms lock for both sides. Definer internals unaffected.

CREATE OR REPLACE FUNCTION guard_assignment_update() RETURNS trigger AS $$
DECLARE
  v_company boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.shift_id <> OLD.shift_id OR NEW.worker_id <> OLD.worker_id OR NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'Assignment shift, worker and source are immutable';
  END IF;

  v_company := owns_shift(OLD.shift_id);

  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' AND NOT shift_has_room(OLD.shift_id, OLD.id) THEN
    RAISE EXCEPTION 'This call is already fully staffed';
  END IF;

  -- once the worker is committed, pay terms lock for BOTH parties — no
  -- silent rate changes on a confirmed booking
  IF OLD.status IN ('confirmed', 'completed', 'no_show')
     AND (NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
          OR NEW.match_score IS DISTINCT FROM OLD.match_score
          OR NEW.match_breakdown IS DISTINCT FROM OLD.match_breakdown) THEN
    RAISE EXCEPTION 'Offer terms lock once the worker is committed' USING ERRCODE = '42501';
  END IF;

  IF v_company THEN
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'applied'   AND NEW.status IN ('confirmed', 'rejected'))
         OR (OLD.status = 'offered'   AND NEW.status = 'rejected')
         OR (OLD.status = 'confirmed' AND NEW.status IN ('no_show', 'rejected'))
         OR (OLD.status IN ('declined', 'withdrawn', 'rejected') AND NEW.status = 'offered')) THEN
      RAISE EXCEPTION 'Company cannot move assignment from % to %', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.worker_id = current_profile_id() THEN
    IF NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
       OR NEW.match_score IS DISTINCT FROM OLD.match_score
       OR NEW.match_breakdown IS DISTINCT FROM OLD.match_breakdown THEN
      RAISE EXCEPTION 'Workers cannot change offer terms';
    END IF;
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'offered' AND NEW.status IN ('confirmed', 'declined'))
         OR (OLD.status IN ('applied', 'confirmed') AND NEW.status = 'withdrawn')) THEN
      RAISE EXCEPTION 'Worker cannot move assignment from % to %', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this assignment';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
