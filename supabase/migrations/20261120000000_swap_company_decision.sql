-- Crew OS deeper: company swap-approval. Swaps notified the company and
-- relied on the normal offer levers; now the decision is explicit, audited,
-- and messaged: approve stamps + nudges the claimer to confirm, reject
-- cancels the swap (cascading claims + the pending offer) with a reason.
--
-- company_decision* are system-managed: the swap guard already returns early
-- for definer internals, so only company_decide_swap can stamp them.

ALTER TABLE swap_requests
  ADD COLUMN IF NOT EXISTS company_decision text,
  ADD COLUMN IF NOT EXISTS company_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_decision_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swap_requests_company_decision_check') THEN
    ALTER TABLE swap_requests ADD CONSTRAINT swap_requests_company_decision_check
      CHECK (company_decision IN ('approved', 'rejected'));
  END IF;
END $$;

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
  IF NEW.company_decision IS DISTINCT FROM OLD.company_decision
     OR NEW.company_decided_at IS DISTINCT FROM OLD.company_decided_at
     OR NEW.company_decision_reason IS DISTINCT FROM OLD.company_decision_reason THEN
    RAISE EXCEPTION 'the company decision is system-managed' USING ERRCODE = '42501';
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

-- Company decides: approve stamps + nudges the claimer (they still confirm
-- their own booking — consent stays worker-side); reject cancels with a
-- reason, cascading to live claims and the pending offer via the triggers.
CREATE OR REPLACE FUNCTION company_decide_swap(
  p_swap_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
) RETURNS swap_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r swap_requests%ROWTYPE;
  v_claimer uuid;
  v_title text;
BEGIN
  SELECT * INTO r FROM swap_requests WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Swap not found'; END IF;
  IF NOT owns_shift(r.shift_id) THEN
    RAISE EXCEPTION 'Only the hiring company can decide this swap' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('open', 'offered') THEN
    RAISE EXCEPTION 'Swap is % — nothing to decide', r.status;
  END IF;
  IF r.company_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Swap already % — the decision is final', r.company_decision;
  END IF;

  SELECT title INTO v_title FROM shifts WHERE id = r.shift_id;
  SELECT claimer_worker_id INTO v_claimer FROM swap_claims WHERE id = r.accepted_claim_id;

  IF p_approve THEN
    UPDATE swap_requests
       SET company_decision = 'approved', company_decided_at = now()
     WHERE id = r.id;
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES
      (r.requester_worker_id, r.shift_id, 'custom', 'Swap approved',
       'The company approved your handoff for "' || coalesce(v_title, 'the call') || '".',
       r.id, 'swap:company-approved:' || r.id::text || ':requester')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    IF v_claimer IS NOT NULL THEN
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES
        (v_claimer, r.shift_id, 'custom', 'Swap approved',
         'The company approved the swap for "' || coalesce(v_title, 'the call') || '" — confirm the offer to make it yours.',
         r.id, 'swap:company-approved:' || r.id::text || ':claimer')
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  ELSE
    UPDATE swap_requests
       SET company_decision = 'rejected', company_decided_at = now(),
           company_decision_reason = NULLIF(p_reason, ''), status = 'cancelled'
     WHERE id = r.id;
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES
      (r.requester_worker_id, r.shift_id, 'custom', 'Swap rejected',
       'The company rejected your handoff for "' || coalesce(v_title, 'the call') || '"' ||
       coalesce(': ' || NULLIF(p_reason, ''), '.'),
       r.id, 'swap:company-rejected:' || r.id::text || ':requester')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    IF v_claimer IS NOT NULL THEN
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES
        (v_claimer, r.shift_id, 'custom', 'Swap rejected',
         'The company rejected the swap for "' || coalesce(v_title, 'the call') || '". Your claim is released.',
         r.id, 'swap:company-rejected:' || r.id::text || ':claimer')
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  SELECT * INTO r FROM swap_requests WHERE id = r.id;
  RETURN r;
END $$;

GRANT EXECUTE ON FUNCTION company_decide_swap(uuid, boolean, text) TO authenticated;
