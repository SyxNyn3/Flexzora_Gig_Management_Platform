-- Crew OS deeper: swap sweetener via payout deduction.
--
-- Sweeteners minted 'manual' — but the requester owes the claimer real money
-- and has no payout on the swapped shift to deduct against, so it could only
-- settle off-platform. With the settle loop's carry-over (added for #28) and
-- iou_transfer payouts (20261117), a payout_deduction IOU anchored on the
-- swapped shift rides the requester's NEXT approved timesheet: it only
-- becomes collectible once that shift ends — exactly when the claimer has
-- actually worked the handoff.

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

    -- Sweetener lands in the ledger as a payout deduction: the requester owes
    -- the claimer, collected from their next approved timesheet once the
    -- swapped shift has ended (carry-over), and paid out to the claimer's
    -- Connect account via an iou_transfer payout.
    IF r.sweetener_cents > 0 THEN
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, settle_via, iou_group_id, notes)
      VALUES (r.requester_worker_id, r.shift_id, 'other', r.sweetener_cents,
              NEW.worker_id, 'payout_deduction', r.id, 'Shift swap sweetener');
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
