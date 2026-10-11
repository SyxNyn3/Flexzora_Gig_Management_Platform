-- Red-team #20: the company branch of guard_crew_iou_update returned NEW
-- unconditionally — an event owner could rewrite beneficiary_worker_id,
-- amount_cents, status, settled_* on shift-anchored IOUs (verified), incl.
-- payout-deductions that land on real paychecks.
--
-- Two changes:
--   1. Standard definer early-return (current_user check) — system internals
--      (settle loop, void cascades, handoffs) keep working exactly as before;
--      they ran as definer already and are covered by their own contracts.
--   2. Company branch → strict immutability: money terms and every
--      settlement field are frozen; the only client-side discretion left is
--      committed -> void (moderation). Anything else must flow through the
--      system paths (settlement, bail, void cascades) which are definer.

CREATE OR REPLACE FUNCTION guard_crew_iou_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF OLD.shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    -- money terms + settlement ledger are immutable to the company
    IF NEW.worker_id IS DISTINCT FROM OLD.worker_id
       OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.beneficiary_worker_id IS DISTINCT FROM OLD.beneficiary_worker_id
       OR NEW.beneficiary IS DISTINCT FROM OLD.beneficiary
       OR NEW.settle_via IS DISTINCT FROM OLD.settle_via
       OR NEW.iou_group_id IS DISTINCT FROM OLD.iou_group_id
       OR NEW.settled_cents IS DISTINCT FROM OLD.settled_cents
       OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
       OR NEW.settled_timesheet_id IS DISTINCT FROM OLD.settled_timesheet_id THEN
      RAISE EXCEPTION 'IOU money terms and settlement fields are immutable to the company'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'committed' OR NEW.status <> 'void' THEN
      RAISE EXCEPTION 'Companies can only void committed IOUs — settlement goes through the payout flow'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.worker_id = v_me THEN
    IF OLD.status <> 'committed' THEN RAISE EXCEPTION 'Only committed IOUs can be changed'; END IF;
    IF NEW.status NOT IN ('committed', 'void') THEN RAISE EXCEPTION 'Workers cannot settle their own IOUs'; END IF;
    IF NEW.worker_id <> OLD.worker_id THEN RAISE EXCEPTION 'worker_id cannot change'; END IF;
    -- a debtor who can edit settled_cents (or aim the IOU elsewhere) cheats
    -- the beneficiary out of the deduction — terms freeze at creation
    IF NEW.settled_cents IS DISTINCT FROM OLD.settled_cents
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.beneficiary_worker_id IS DISTINCT FROM OLD.beneficiary_worker_id
       OR NEW.beneficiary IS DISTINCT FROM OLD.beneficiary
       OR NEW.settle_via IS DISTINCT FROM OLD.settle_via
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
       OR NEW.iou_group_id IS DISTINCT FROM OLD.iou_group_id THEN
      RAISE EXCEPTION 'IOU terms are set at creation — void and repost to change them';
    END IF;
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
