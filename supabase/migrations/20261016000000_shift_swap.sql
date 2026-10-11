-- Crew OS #7: ShiftSwap — hand a confirmed booking to a credentialed crewmate.
--
-- Flow:
--   1. A confirmed worker posts a swap_request (reason + optional sweetener).
--   2. Workers who meet the shift's cert gate (and aren't already booked on
--      it) file swap_claims; several pending claims may sit on one request.
--   3. The requester accepts one claim -> the system creates an 'offered'
--      assignment for the claimer (same offer flow as direct-book: worker
--      accepts or declines; company sees it on their board and retains the
--      normal cancellation levers). Other claims reject automatically.
--   4. Claimer confirms -> the original assignment flips to 'withdrawn',
--      the swap completes, and any sweetener lands in the crew_iou ledger.
--
-- Company approval rides the existing offer flow: the claimer holds an
-- 'offered' assignment until they accept, and the company is notified and
-- can decline the offer through the usual paths.
--
-- Trigger layout follows the established pattern: guards are SECURITY
-- INVOKER and self-exempt when a SECURITY DEFINER cascade owns the write;
-- bookkeeping lives in DEFINER sync functions.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swap_request_status') THEN
    CREATE TYPE swap_request_status AS ENUM ('open', 'offered', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swap_claim_status') THEN
    CREATE TYPE swap_claim_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Cert gate (shared by claim validation + RLS visibility)
-- ---------------------------------------------------------------------------

-- Mirrors matchScore's gatekeeper: verified, active, covers the call date.
CREATE OR REPLACE FUNCTION worker_meets_shift_certs(p_worker_id uuid, p_shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE WHEN s.id IS NULL THEN false ELSE
    NOT EXISTS (
      SELECT 1
      FROM unnest(s.required_cert_codes) AS req(code)
      WHERE NOT EXISTS (
        SELECT 1 FROM certifications c
        WHERE c.worker_id = p_worker_id
          AND c.cert_type_code = req.code
          AND c.is_active
          AND c.verified
          AND (c.expiration_date IS NULL OR c.expiration_date >= s.starts_at::date)
      )
    )
  END
  FROM (SELECT id, required_cert_codes, starts_at FROM shifts WHERE id = p_shift_id) s;
$$;
GRANT EXECUTE ON FUNCTION worker_meets_shift_certs(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE REFERENCES shift_assignments(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  requester_worker_id uuid NOT NULL REFERENCES profiles(id),
  reason text,
  sweetener_cents integer NOT NULL DEFAULT 0 CHECK (sweetener_cents >= 0),
  accepted_claim_id uuid,
  offered_assignment_id uuid REFERENCES shift_assignments(id) ON DELETE SET NULL,
  status swap_request_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS swap_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_request_id uuid NOT NULL REFERENCES swap_requests(id) ON DELETE CASCADE,
  claimer_worker_id uuid NOT NULL REFERENCES profiles(id),
  message text,
  status swap_claim_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (swap_request_id, claimer_worker_id)
);

ALTER TABLE swap_requests
  ADD CONSTRAINT swap_requests_accepted_claim_fkey
  FOREIGN KEY (accepted_claim_id) REFERENCES swap_claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS swap_requests_shift_idx ON swap_requests (shift_id, status);
CREATE INDEX IF NOT EXISTS swap_claims_request_idx ON swap_claims (swap_request_id, status);

DROP TRIGGER IF EXISTS swap_requests_touch ON swap_requests;
DROP TRIGGER IF EXISTS swap_claims_touch ON swap_claims;
CREATE TRIGGER swap_requests_touch BEFORE UPDATE ON swap_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER swap_claims_touch BEFORE UPDATE ON swap_claims FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Guards (SECURITY INVOKER — current_user exemption lets DEFINER cascades pass)
-- ---------------------------------------------------------------------------

-- Request integrity: assignment must be a confirmed booking owned by the
-- requester on the request's own shift.
CREATE OR REPLACE FUNCTION guard_swap_request_insert() RETURNS trigger AS $$
DECLARE
  a shift_assignments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM shift_assignments WHERE id = NEW.assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;
  IF a.worker_id <> NEW.requester_worker_id OR a.shift_id <> NEW.shift_id THEN
    RAISE EXCEPTION 'swap request must match the assignment worker and shift';
  END IF;
  IF a.status <> 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed booking can be swapped (status: %)', a.status;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_swap_request_insert ON swap_requests;
CREATE TRIGGER guard_swap_request_insert BEFORE INSERT ON swap_requests
  FOR EACH ROW EXECUTE FUNCTION guard_swap_request_insert();

-- Users can only cancel an open/offered swap. Every other transition
-- (offered, completed, reopen) belongs to the definer state machine.
--
-- #22: this guard fires on EVERY update, not just status. The anchor
-- columns (assignment, shift, requester) and the system pointers
-- (accepted_claim_id, offered_assignment_id) are immutable through the API —
-- otherwise a requester could re-point the swap at a cert-gated shift after
-- an uncerted claim passed validation, or aim offered_assignment_id at a
-- victim's booking so the handoff trigger withdraws it. The sweetener locks
-- the moment anyone has claimed, killing the bait-and-switch.
CREATE OR REPLACE FUNCTION guard_swap_request_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
     OR NEW.requester_worker_id IS DISTINCT FROM OLD.requester_worker_id THEN
    RAISE EXCEPTION 'swap request anchors (assignment, shift, requester) are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.accepted_claim_id IS DISTINCT FROM OLD.accepted_claim_id
     OR NEW.offered_assignment_id IS DISTINCT FROM OLD.offered_assignment_id THEN
    RAISE EXCEPTION 'swap pointers are system-managed' USING ERRCODE = '42501';
  END IF;
  IF NEW.sweetener_cents IS DISTINCT FROM OLD.sweetener_cents THEN
    IF OLD.status <> 'open' OR EXISTS (
      SELECT 1 FROM swap_claims c WHERE c.swap_request_id = OLD.id AND c.status IN ('pending', 'accepted')
    ) THEN
      RAISE EXCEPTION 'sweetener is locked once a claim exists' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' AND OLD.status IN ('open', 'offered') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'swap requests move only through the claim/offer flow';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_swap_request_update ON swap_requests;
CREATE TRIGGER guard_swap_request_update BEFORE UPDATE ON swap_requests
  FOR EACH ROW EXECUTE FUNCTION guard_swap_request_update();

-- Claim validation: claimer must meet the cert gate, must not be the
-- requester, and must not already hold a live booking on the same shift.
CREATE OR REPLACE FUNCTION guard_swap_claim_insert() RETURNS trigger AS $$
DECLARE
  r swap_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM swap_requests WHERE id = NEW.swap_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap request not found';
  END IF;
  IF r.status <> 'open' THEN
    RAISE EXCEPTION 'swap is not open for claims';
  END IF;
  IF NEW.claimer_worker_id = r.requester_worker_id THEN
    RAISE EXCEPTION 'cannot claim your own swap';
  END IF;
  IF NOT worker_meets_shift_certs(NEW.claimer_worker_id, r.shift_id) THEN
    RAISE EXCEPTION 'missing required certifications for this shift';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shift_assignments sa
    WHERE sa.shift_id = r.shift_id
      AND sa.worker_id = NEW.claimer_worker_id
      AND sa.status IN ('offered', 'applied', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'already booked on this shift';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_swap_claim_insert ON swap_claims;
CREATE TRIGGER guard_swap_claim_insert BEFORE INSERT ON swap_claims
  FOR EACH ROW EXECUTE FUNCTION guard_swap_claim_insert();

-- Who may drive each claim transition. The requester accepts/rejects; the
-- claimer withdraws their own; the company can reject as an override.
CREATE OR REPLACE FUNCTION guard_swap_claim_update() RETURNS trigger AS $$
DECLARE
  r swap_requests%ROWTYPE;
  caller uuid := current_profile_id();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  -- #22: a claim belongs to exactly one claimer on exactly one request — the
  -- requester/company must not be able to re-point it at a non-consenting
  -- worker and then accept it.
  IF NEW.claimer_worker_id IS DISTINCT FROM OLD.claimer_worker_id
     OR NEW.swap_request_id IS DISTINCT FROM OLD.swap_request_id THEN
    RAISE EXCEPTION 'claim identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT * INTO r FROM swap_requests WHERE id = OLD.swap_request_id;

  IF OLD.status = 'pending' AND NEW.status = 'accepted'
     AND caller IS DISTINCT FROM r.requester_worker_id THEN
    RAISE EXCEPTION 'only the requester can accept a claim';
  END IF;
  IF NEW.status = 'rejected'
     AND caller IS DISTINCT FROM r.requester_worker_id
     AND NOT owns_shift(r.shift_id) THEN
    RAISE EXCEPTION 'only the requester or the company can reject a claim';
  END IF;
  IF NEW.status = 'withdrawn' AND caller IS DISTINCT FROM NEW.claimer_worker_id THEN
    RAISE EXCEPTION 'only the claimer can withdraw';
  END IF;

  -- Legal transitions for everyone who passed the role checks.
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected', 'withdrawn') THEN RETURN NEW; END IF;
  IF OLD.status = 'accepted' AND NEW.status IN ('rejected', 'withdrawn') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'illegal claim transition % -> %', OLD.status, NEW.status;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_swap_claim_update ON swap_claims;
CREATE TRIGGER guard_swap_claim_update BEFORE UPDATE ON swap_claims
  FOR EACH ROW EXECUTE FUNCTION guard_swap_claim_update();

-- ---------------------------------------------------------------------------
-- State machine (SECURITY DEFINER — does the cross-user bookkeeping)
-- ---------------------------------------------------------------------------

-- Accepting a claim is the big move: it rejects the rest, writes the
-- claimer's 'offered' assignment, and tells the company a swap is pending
-- in their normal offer flow. Un-accepting pulls the offer back.
CREATE OR REPLACE FUNCTION sync_swap_claim() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r swap_requests%ROWTYPE;
  new_assignment_id uuid;
  company_owner uuid;
  shift_title text;
  requester_name text;
BEGIN
  SELECT * INTO r FROM swap_requests WHERE id = NEW.swap_request_id;

  IF OLD.status = 'pending' AND NEW.status = 'accepted' AND r.status = 'open' THEN
    SELECT s.title INTO shift_title FROM shifts s WHERE s.id = r.shift_id;
    SELECT p.full_name INTO requester_name FROM profiles p WHERE p.id = r.requester_worker_id;

    UPDATE swap_claims SET status = 'rejected'
    WHERE swap_request_id = r.id AND status = 'pending' AND id <> NEW.id;

    -- Revives a previously-terminal assignment row if one exists.
    INSERT INTO shift_assignments (shift_id, worker_id, status, source, offered_rate)
    SELECT r.shift_id, NEW.claimer_worker_id, 'offered', 'public_marketplace',
           coalesce((SELECT a.offered_rate FROM shift_assignments a WHERE a.id = r.assignment_id),
                    (SELECT s.hourly_rate FROM shifts s WHERE s.id = r.shift_id))
    ON CONFLICT (shift_id, worker_id)
    DO UPDATE SET status = 'offered', offered_rate = EXCLUDED.offered_rate
    RETURNING id INTO new_assignment_id;

    UPDATE swap_requests
    SET status = 'offered', accepted_claim_id = NEW.id, offered_assignment_id = new_assignment_id
    WHERE id = r.id;

    -- Company notification: the swap shows up in their offer flow.
    SELECT c.created_by INTO company_owner
    FROM events e JOIN companies c ON c.id = e.company_id
    JOIN shifts s ON s.event_id = e.id
    WHERE s.id = r.shift_id;
    IF company_owner IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, metadata)
      VALUES (company_owner, 'Shift swap pending',
        coalesce(requester_name, 'A crew member') || ' wants to hand off "' || coalesce(shift_title, 'a shift') ||
        '" — a replacement offer is out for approval.',
        'swap', jsonb_build_object('swap_request_id', r.id, 'offered_assignment_id', new_assignment_id));
    END IF;
  END IF;

  -- Unwinding an accepted claim pulls the offer back and re-opens the swap.
  IF OLD.status = 'accepted' AND NEW.status IN ('rejected', 'withdrawn') THEN
    UPDATE shift_assignments SET status = 'declined'
    WHERE id = r.offered_assignment_id AND status = 'offered';
    UPDATE swap_requests
    SET status = 'open', accepted_claim_id = NULL, offered_assignment_id = NULL
    WHERE id = r.id AND status = 'offered';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_swap_claim ON swap_claims;
CREATE TRIGGER sync_swap_claim AFTER UPDATE OF status ON swap_claims
  FOR EACH ROW EXECUTE FUNCTION sync_swap_claim();

-- Cancel fans out to live claims + the pending offer.
CREATE OR REPLACE FUNCTION swap_request_side_effects() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE swap_claims SET status = 'rejected'
    WHERE swap_request_id = NEW.id AND status IN ('pending', 'accepted');
    IF NEW.offered_assignment_id IS NOT NULL THEN
      UPDATE shift_assignments SET status = 'declined'
      WHERE id = NEW.offered_assignment_id AND status = 'offered';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS swap_request_side_effects ON swap_requests;
CREATE TRIGGER swap_request_side_effects AFTER UPDATE OF status ON swap_requests
  FOR EACH ROW EXECUTE FUNCTION swap_request_side_effects();

-- Handoff: the claimer's offer resolves the swap.
CREATE OR REPLACE FUNCTION swap_on_offer_response() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r swap_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM swap_requests WHERE offered_assignment_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    UPDATE shift_assignments SET status = 'withdrawn' WHERE id = r.assignment_id;
    UPDATE swap_requests SET status = 'completed' WHERE id = r.id;

    -- Sweetener lands in the ledger: requester owes the claimer. Manual
    -- settlement for v1 — the requester no longer has a payout on this
    -- shift to deduct against.
    IF r.sweetener_cents > 0 THEN
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, settle_via, iou_group_id, notes)
      VALUES (r.requester_worker_id, r.shift_id, 'other', r.sweetener_cents,
              NEW.worker_id, 'manual', r.id, 'Shift swap sweetener');
    END IF;

    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES
      (r.requester_worker_id, r.shift_id, 'custom', 'Swap complete',
       'Your shift handoff went through — you are released from the call.',
       r.id, 'swap:done:' || r.id::text || ':requester'),
      (NEW.worker_id, r.shift_id, 'custom', 'Swap complete',
       'You are booked — the shift is yours now.',
       r.id, 'swap:done:' || r.id::text || ':claimer')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  -- Offer died before acceptance: unwind the swap so someone else can claim.
  IF NEW.status IN ('declined', 'withdrawn', 'rejected') AND OLD.status = 'offered' THEN
    UPDATE swap_requests
    SET status = 'open', accepted_claim_id = NULL, offered_assignment_id = NULL
    WHERE id = r.id AND status = 'offered';
    UPDATE swap_claims SET status = 'rejected'
    WHERE swap_request_id = r.id AND status = 'accepted';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS swap_on_offer_response ON shift_assignments;
CREATE TRIGGER swap_on_offer_response AFTER UPDATE OF status ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION swap_on_offer_response();

-- Shift deletes: open and in-flight swaps die with it.
CREATE OR REPLACE FUNCTION swap_on_shift_gone() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  UPDATE swap_requests SET status = 'cancelled'
  WHERE shift_id = OLD.id AND status IN ('open', 'offered');
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS swap_on_shift_delete ON shifts;
CREATE TRIGGER swap_on_shift_delete BEFORE DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION swap_on_shift_gone();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_claims ENABLE ROW LEVEL SECURITY;

-- Cert-gated visibility: the requester, the company, and workers who could
-- actually take the call see the swap. Everyone else sees nothing.
DROP POLICY IF EXISTS "swap_requests select" ON swap_requests;
CREATE POLICY "swap_requests select" ON swap_requests FOR SELECT TO authenticated USING (
  requester_worker_id = current_profile_id()
  OR owns_shift(shift_id)
  OR worker_meets_shift_certs(current_profile_id(), shift_id)
);

DROP POLICY IF EXISTS "swap_requests insert" ON swap_requests;
CREATE POLICY "swap_requests insert" ON swap_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_worker_id = current_profile_id()
    AND EXISTS (
      SELECT 1 FROM shift_assignments a
      WHERE a.id = assignment_id AND a.worker_id = current_profile_id()
    )
  );

DROP POLICY IF EXISTS "swap_requests update" ON swap_requests;
CREATE POLICY "swap_requests update" ON swap_requests FOR UPDATE TO authenticated
  USING (requester_worker_id = current_profile_id() OR owns_shift(shift_id))
  WITH CHECK (requester_worker_id = current_profile_id() OR owns_shift(shift_id));

DROP POLICY IF EXISTS "swap_claims select" ON swap_claims;
CREATE POLICY "swap_claims select" ON swap_claims FOR SELECT TO authenticated USING (
  claimer_worker_id = current_profile_id()
  OR EXISTS (SELECT 1 FROM swap_requests r WHERE r.id = swap_request_id
             AND (r.requester_worker_id = current_profile_id() OR owns_shift(r.shift_id)))
);

DROP POLICY IF EXISTS "swap_claims insert" ON swap_claims;
CREATE POLICY "swap_claims insert" ON swap_claims FOR INSERT TO authenticated
  WITH CHECK (claimer_worker_id = current_profile_id());

DROP POLICY IF EXISTS "swap_claims update" ON swap_claims;
CREATE POLICY "swap_claims update" ON swap_claims FOR UPDATE TO authenticated
  USING (
    claimer_worker_id = current_profile_id()
    OR EXISTS (SELECT 1 FROM swap_requests r WHERE r.id = swap_request_id
               AND (r.requester_worker_id = current_profile_id() OR owns_shift(r.shift_id)))
  );
