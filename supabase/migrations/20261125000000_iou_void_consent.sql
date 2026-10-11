-- Red-team #51: a debtor could void an AUTO-MINTED IOU (ride match, board
-- resolve, swap sweetener, bail fee, GrubRun) and steal the beneficiary's
-- share — verified. System IOUs are marked by iou_group_id; those now need
-- the beneficiary's consent to void. IOUs the worker created themselves
-- (iou_group_id IS NULL) still void directly — retracting your own promise
-- harms no one else's ledger.
--
-- void_requested_at is RPC-managed (frozen in the guard) so the request
-- always comes with the beneficiary alert; consent/deny clear or void.

ALTER TABLE crew_iou ADD COLUMN IF NOT EXISTS void_requested_at timestamptz;

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
       OR NEW.settled_timesheet_id IS DISTINCT FROM OLD.settled_timesheet_id
       OR NEW.void_requested_at IS DISTINCT FROM OLD.void_requested_at THEN
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
       OR NEW.iou_group_id IS DISTINCT FROM OLD.iou_group_id
       OR NEW.void_requested_at IS DISTINCT FROM OLD.void_requested_at THEN
      RAISE EXCEPTION 'IOU terms are set at creation — void and repost to change them';
    END IF;
    -- #51: system-minted IOUs carry the payee's expectation — voiding one
    -- steals their share. Those move only through the consent RPCs.
    IF NEW.status = 'void' AND OLD.iou_group_id IS NOT NULL THEN
      RAISE EXCEPTION 'This IOU was minted by a crew arrangement — voiding needs the beneficiary''s consent (request it first)'
        USING ERRCODE = '42501';
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

-- Debtor asks to void: flags the IOU and alerts the beneficiary.
CREATE OR REPLACE FUNCTION request_iou_void(p_iou_id uuid)
RETURNS crew_iou
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  i crew_iou%ROWTYPE;
BEGIN
  SELECT * INTO i FROM crew_iou WHERE id = p_iou_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IOU not found'; END IF;
  IF i.worker_id IS DISTINCT FROM current_profile_id() THEN
    RAISE EXCEPTION 'Only the debtor can request a void' USING ERRCODE = '42501';
  END IF;
  IF i.status <> 'committed' THEN RAISE EXCEPTION 'IOU is % — nothing to void', i.status; END IF;
  IF i.iou_group_id IS NULL THEN
    RAISE EXCEPTION 'This IOU is yours — void it directly';
  END IF;
  UPDATE crew_iou SET void_requested_at = now() WHERE id = i.id;
  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id)
  VALUES (i.beneficiary_worker_id, i.shift_id, 'iou', 'Void requested',
    'The other party wants to void your ' || to_char(i.amount_cents / 100.0, 'FM999999990.00') ||
    ' ' || i.kind::text || ' share. Consent to release it, or deny to keep it committed.',
    i.id);
  SELECT * INTO i FROM crew_iou WHERE id = i.id;
  RETURN i;
END $$;

-- Beneficiary consents: the IOU voids and the debtor is told.
CREATE OR REPLACE FUNCTION consent_iou_void(p_iou_id uuid)
RETURNS crew_iou
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  i crew_iou%ROWTYPE;
BEGIN
  SELECT * INTO i FROM crew_iou WHERE id = p_iou_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IOU not found'; END IF;
  IF i.beneficiary_worker_id IS DISTINCT FROM current_profile_id() THEN
    RAISE EXCEPTION 'Only the beneficiary can consent' USING ERRCODE = '42501';
  END IF;
  IF i.void_requested_at IS NULL THEN RAISE EXCEPTION 'No void was requested'; END IF;
  UPDATE crew_iou SET status = 'void', void_requested_at = NULL, updated_at = now() WHERE id = i.id;
  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id)
  VALUES (i.worker_id, i.shift_id, 'iou', 'Void consented',
    'The ' || i.kind::text || ' share you asked to void was released.', i.id);
  SELECT * INTO i FROM crew_iou WHERE id = i.id;
  RETURN i;
END $$;

-- Beneficiary denies: request flag clears, IOU stays committed.
CREATE OR REPLACE FUNCTION deny_iou_void(p_iou_id uuid)
RETURNS crew_iou
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  i crew_iou%ROWTYPE;
BEGIN
  SELECT * INTO i FROM crew_iou WHERE id = p_iou_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IOU not found'; END IF;
  IF i.beneficiary_worker_id IS DISTINCT FROM current_profile_id() THEN
    RAISE EXCEPTION 'Only the beneficiary can deny' USING ERRCODE = '42501';
  END IF;
  IF i.void_requested_at IS NULL THEN RAISE EXCEPTION 'No void was requested'; END IF;
  UPDATE crew_iou SET void_requested_at = NULL, updated_at = now() WHERE id = i.id;
  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id)
  VALUES (i.worker_id, i.shift_id, 'iou', 'Void denied',
    'The ' || i.kind::text || ' share stays committed — the beneficiary denied the void.', i.id);
  SELECT * INTO i FROM crew_iou WHERE id = i.id;
  RETURN i;
END $$;

GRANT EXECUTE ON FUNCTION request_iou_void(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION consent_iou_void(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION deny_iou_void(uuid) TO authenticated;
