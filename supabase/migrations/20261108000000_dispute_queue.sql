-- Dispute mediation queue.
--
-- timesheets.status='disputed' existed with no resolution path: either party
-- can open a dispute (worker flags pay/time, company flags the sheet), the
-- company mediates — accept as submitted, adjust the clock record, or void
-- the sheet. All dispute fields are system-managed like clock/GPS/pay.

ALTER TYPE timesheet_status ADD VALUE IF NOT EXISTS 'voided';

ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS dispute_opened_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS resolution text
    CHECK (resolution IS NULL OR resolution IN ('as_submitted', 'adjusted', 'voided')),
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Same guard as marketplace_core, verbatim — plus the dispute fields join the
-- system-managed block (workers/companies must go through the RPCs).
CREATE OR REPLACE FUNCTION guard_timesheet_update() RETURNS trigger AS $$
DECLARE
  v_company boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.assignment_id <> OLD.assignment_id OR NEW.shift_id <> OLD.shift_id OR NEW.worker_id <> OLD.worker_id
     OR NEW.clock_in_at IS DISTINCT FROM OLD.clock_in_at OR NEW.clock_in_lat IS DISTINCT FROM OLD.clock_in_lat
     OR NEW.clock_in_lng IS DISTINCT FROM OLD.clock_in_lng OR NEW.clock_in_distance_m IS DISTINCT FROM OLD.clock_in_distance_m
     OR NEW.clock_in_verified IS DISTINCT FROM OLD.clock_in_verified
     OR NEW.clock_out_at IS DISTINCT FROM OLD.clock_out_at OR NEW.clock_out_lat IS DISTINCT FROM OLD.clock_out_lat
     OR NEW.clock_out_lng IS DISTINCT FROM OLD.clock_out_lng OR NEW.clock_out_distance_m IS DISTINCT FROM OLD.clock_out_distance_m
     OR NEW.clock_out_verified IS DISTINCT FROM OLD.clock_out_verified
     OR NEW.regular_hours IS DISTINCT FROM OLD.regular_hours OR NEW.overtime_hours IS DISTINCT FROM OLD.overtime_hours
     OR NEW.doubletime_hours IS DISTINCT FROM OLD.doubletime_hours OR NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.dispute_opened_by IS DISTINCT FROM OLD.dispute_opened_by OR NEW.dispute_reason IS DISTINCT FROM OLD.dispute_reason
     OR NEW.resolution IS DISTINCT FROM OLD.resolution OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'Clock, GPS, pay and dispute fields are system-managed';
  END IF;

  v_company := owns_shift(OLD.shift_id);

  IF v_company THEN
    IF NOT (NEW.status = OLD.status
         OR (OLD.status IN ('submitted', 'disputed') AND NEW.status IN ('submitted', 'disputed'))) THEN
      RAISE EXCEPTION 'Use approve_timesheet() to approve a timesheet';
    END IF;
  ELSIF OLD.worker_id = current_profile_id() THEN
    IF NEW.status <> OLD.status OR NEW.manager_notes IS DISTINCT FROM OLD.manager_notes THEN
      RAISE EXCEPTION 'Workers may only edit notes and break minutes';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this timesheet';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Either party opens the dispute; the other side gets notified.
CREATE OR REPLACE FUNCTION open_timesheet_dispute(p_timesheet_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ts timesheets%ROWTYPE;
  v_caller uuid := current_profile_id();
  v_company uuid;
BEGIN
  SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timesheet not found';
  END IF;
  IF v_ts.status NOT IN ('submitted', 'approved') THEN
    RAISE EXCEPTION 'Only submitted or approved timesheets can be disputed (status: %)', v_ts.status;
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;

  SELECT e.company_id INTO v_company
  FROM shifts s JOIN events e ON e.id = s.event_id WHERE s.id = v_ts.shift_id;

  IF v_ts.worker_id = v_caller THEN
    INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
    SELECT c.created_by, 'Timesheet disputed',
           'A worker disputed their timesheet: ' || p_reason,
           'warning', '/timesheets', jsonb_build_object('timesheet_id', v_ts.id)
    FROM companies c WHERE c.id = v_company AND c.created_by IS NOT NULL;
  ELSIF owns_company(v_company) THEN
    INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
    VALUES (v_ts.worker_id, 'Timesheet flagged',
            'Your timesheet was flagged for review: ' || p_reason,
            'warning', '/dashboard', jsonb_build_object('timesheet_id', v_ts.id));
  ELSE
    RAISE EXCEPTION 'Not a party to this timesheet';
  END IF;

  UPDATE timesheets SET
    status = 'disputed',
    dispute_opened_by = v_caller,
    dispute_reason = p_reason,
    resolution = NULL,
    resolved_by = NULL,
    resolved_at = NULL,
    updated_at = now()
  WHERE id = p_timesheet_id;
  RETURN true;
END $$;

-- Company mediates: accept as submitted, adjust the clock record, or void it.
CREATE OR REPLACE FUNCTION resolve_timesheet_dispute(
  p_timesheet_id uuid,
  p_resolution text,
  p_clock_in timestamptz DEFAULT NULL,
  p_clock_out timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ts timesheets%ROWTYPE;
  v_company uuid;
BEGIN
  SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timesheet not found';
  END IF;
  IF v_ts.status <> 'disputed' THEN
    RAISE EXCEPTION 'timesheet is not disputed (status: %)', v_ts.status;
  END IF;
  SELECT e.company_id INTO v_company
  FROM shifts s JOIN events e ON e.id = s.event_id WHERE s.id = v_ts.shift_id;
  IF NOT owns_company(v_company) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;
  IF p_resolution NOT IN ('as_submitted', 'adjusted', 'voided') THEN
    RAISE EXCEPTION 'resolution must be as_submitted | adjusted | voided';
  END IF;
  IF p_resolution = 'adjusted' AND (p_clock_in IS NULL OR p_clock_out IS NULL OR p_clock_in >= p_clock_out) THEN
    RAISE EXCEPTION 'adjusted resolution needs valid corrected times (in before out)';
  END IF;

  UPDATE timesheets SET
    status = CASE WHEN p_resolution = 'voided' THEN 'voided'::timesheet_status ELSE 'submitted'::timesheet_status END,
    clock_in_at = CASE WHEN p_resolution = 'adjusted' THEN p_clock_in ELSE clock_in_at END,
    clock_out_at = CASE WHEN p_resolution = 'adjusted' THEN p_clock_out ELSE clock_out_at END,
    resolution = p_resolution,
    resolved_by = current_profile_id(),
    resolved_at = now(),
    manager_notes = COALESCE(p_note, manager_notes),
    updated_at = now()
  WHERE id = p_timesheet_id;

  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  VALUES (v_ts.worker_id,
          'Timesheet dispute resolved',
          CASE p_resolution
            WHEN 'as_submitted' THEN 'Your timesheet was accepted as submitted and is back in the approval queue.'
            WHEN 'adjusted' THEN 'The company corrected the clock record — the adjusted timesheet is back in the approval queue.'
            ELSE 'The timesheet was voided after review.'
          END,
          CASE WHEN p_resolution = 'voided' THEN 'warning' ELSE 'info' END,
          '/dashboard', jsonb_build_object('timesheet_id', v_ts.id, 'resolution', p_resolution));
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION open_timesheet_dispute(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_timesheet_dispute(uuid, text, timestamptz, timestamptz, text) TO authenticated;
