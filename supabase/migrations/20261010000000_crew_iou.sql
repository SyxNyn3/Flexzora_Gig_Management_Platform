-- Crew OS foundation: the IOU ledger (`crew_iou`).
--
-- Workers commit to shared gig costs (gas, lodging, food, gear) before the
-- money exists; the commitment settles automatically when the shift's
-- timesheet is approved. approve_timesheet deducts Σ committed IOUs — capped
-- at 25% of gross so nobody signs away the check — from the payout, records
-- the deduction as an invoice line item, and marks the IOUs settled.
--
-- Cancellation semantics: committed IOUs are soft — a cancelled shift voids
-- them (trigger below) because the payout they would have settled against
-- never happens. 'manual' IOUs settle off-platform and are marked settled by
-- the beneficiary. 'instant_pay' is reserved for a future card charge.
--
-- v1 note: the deducted amount remains in the event's funded escrow — the
-- beneficiary transfer itself lands with Stripe Connect. The ledger is the
-- source of truth for what is owed to whom until then.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_iou_kind') THEN
    CREATE TYPE crew_iou_kind AS ENUM ('ride', 'lodging', 'food', 'gear', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_iou_status') THEN
    CREATE TYPE crew_iou_status AS ENUM ('committed', 'settled', 'void', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_iou_settle_via') THEN
    CREATE TYPE crew_iou_settle_via AS ENUM ('payout_deduction', 'instant_pay', 'manual');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crew_iou (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- nullable: a settled IOU outlives its shift (SET NULL keeps the ledger row)
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  kind crew_iou_kind NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  -- beneficiary is either a platform user (beneficiary_worker_id: the driver,
  -- host, or food runner) or free text for off-platform payees
  beneficiary_worker_id uuid REFERENCES profiles(id),
  beneficiary text,
  status crew_iou_status NOT NULL DEFAULT 'committed',
  settle_via crew_iou_settle_via NOT NULL DEFAULT 'payout_deduction',
  iou_group_id uuid,                      -- links the shares of one pool
  notes text,
  settled_at timestamptz,
  settled_timesheet_id uuid REFERENCES timesheets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (beneficiary_worker_id IS NOT NULL OR beneficiary IS NOT NULL),
  CHECK (beneficiary_worker_id IS NULL OR beneficiary_worker_id <> worker_id)
);

CREATE INDEX IF NOT EXISTS crew_iou_worker_idx ON crew_iou (worker_id, status);
CREATE INDEX IF NOT EXISTS crew_iou_shift_idx ON crew_iou (shift_id, status);
CREATE INDEX IF NOT EXISTS crew_iou_group_idx ON crew_iou (iou_group_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Legal transitions, enforced on top of RLS (which grants party-level access):
--   worker owner : edit details / void while committed — never self-settle
--   beneficiary  : committed -> settled, manual IOUs only, nothing else changes
--   company owner of the shift's event : manager discretion (also the path
--     approve_timesheet's settlement UPDATE takes — caller is the manager)
CREATE OR REPLACE FUNCTION guard_crew_iou_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
BEGIN
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

DROP TRIGGER IF EXISTS crew_iou_guard ON crew_iou;
CREATE TRIGGER crew_iou_guard BEFORE UPDATE ON crew_iou
  FOR EACH ROW EXECUTE FUNCTION guard_crew_iou_update();

DROP TRIGGER IF EXISTS crew_iou_touch ON crew_iou;
CREATE TRIGGER crew_iou_touch BEFORE UPDATE ON crew_iou
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Shift cancelled => every soft commitment against it voids.
CREATE OR REPLACE FUNCTION void_ious_on_shift_cancel() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE crew_iou SET status = 'void', updated_at = now()
    WHERE shift_id = NEW.id AND status = 'committed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_void_ious ON shifts;
CREATE TRIGGER shifts_void_ious AFTER UPDATE OF status ON shifts
  FOR EACH ROW EXECUTE FUNCTION void_ious_on_shift_cancel();

-- Shift hard-deleted => same void (runs before the FK's SET NULL so the row's
-- committed status flips first; settled rows keep their audit trail either way)
CREATE OR REPLACE FUNCTION void_ious_on_shift_delete() RETURNS trigger AS $$
BEGIN
  UPDATE crew_iou SET status = 'void', updated_at = now()
  WHERE shift_id = OLD.id AND status = 'committed';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_void_ious_delete ON shifts;
CREATE TRIGGER shifts_void_ious_delete BEFORE DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION void_ious_on_shift_delete();

-- ---------------------------------------------------------------------------
-- RLS: worker owns their ledger; beneficiary sees what they're owed; the
-- company sees IOUs on their events (aggregate visibility for ops)
-- ---------------------------------------------------------------------------
ALTER TABLE crew_iou ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew iou readable by parties" ON crew_iou;
CREATE POLICY "crew iou readable by parties" ON crew_iou FOR SELECT TO authenticated
  USING (
    worker_id = current_profile_id()
    OR beneficiary_worker_id = current_profile_id()
    OR (shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = crew_iou.shift_id)))
  );

DROP POLICY IF EXISTS "workers commit own ious" ON crew_iou;
CREATE POLICY "workers commit own ious" ON crew_iou FOR INSERT TO authenticated
  WITH CHECK (worker_id = current_profile_id() AND status = 'committed');

DROP POLICY IF EXISTS "parties update ious" ON crew_iou;
CREATE POLICY "parties update ious" ON crew_iou FOR UPDATE TO authenticated
  USING (
    worker_id = current_profile_id()
    OR beneficiary_worker_id = current_profile_id()
    OR (shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = crew_iou.shift_id)))
  )
  WITH CHECK (
    worker_id = current_profile_id()
    OR beneficiary_worker_id = current_profile_id()
    OR (shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = crew_iou.shift_id)))
  );

-- No DELETE: the ledger is append-only; removal is 'void'.

-- ---------------------------------------------------------------------------
-- approve_timesheet: settle committed IOUs out of the payout.
-- Full-body CREATE OR REPLACE based on the current (20261001000000) body —
-- the only changes are the marked settlement block and drawing net
-- (gross - deduction) from escrow. SET search_path is restated because
-- CREATE OR REPLACE drops function attributes set by ALTER FUNCTION.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_timesheet(
  p_timesheet_id uuid,
  p_break_minutes integer DEFAULT NULL,
  p_payout_method text DEFAULT 'ach'
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ts timesheets%ROWTYPE;
  v_assignment shift_assignments%ROWTYPE;
  v_shift shifts%ROWTYPE;
  v_event events%ROWTYPE;
  v_rule overtime_rules%ROWTYPE;
  v_caller uuid;
  v_rate numeric;
  v_fee_pct numeric;
  v_worked numeric;
  v_prior_weekly numeric;
  v_room numeric;
  v_reg numeric; v_ot numeric; v_dt numeric;
  v_gross numeric; v_fee numeric;
  v_iou crew_iou%ROWTYPE;
  v_iou_room integer;
  v_iou_cents integer := 0;
  v_iou_deduction numeric := 0;
  v_net numeric;
  v_remaining numeric;
  v_take numeric;
  v_invoice invoices%ROWTYPE;
  v_escrow escrow_deposits%ROWTYPE;
BEGIN
  SELECT id INTO v_caller FROM profiles WHERE user_id = auth.uid();
  SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF v_ts.id IS NULL THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF v_ts.status NOT IN ('submitted','disputed') THEN RAISE EXCEPTION 'Timesheet is % and cannot be approved', v_ts.status; END IF;
  IF v_ts.clock_in_at IS NULL OR v_ts.clock_out_at IS NULL THEN RAISE EXCEPTION 'Timesheet has no complete clock record'; END IF;

  SELECT * INTO v_assignment FROM shift_assignments WHERE id = v_ts.assignment_id;
  SELECT * INTO v_shift FROM shifts WHERE id = v_ts.shift_id;
  SELECT * INTO v_event FROM events WHERE id = v_shift.event_id;
  IF NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_event.company_id AND c.created_by = v_caller) THEN
    RAISE EXCEPTION 'Only the hiring company can approve this timesheet';
  END IF;
  SELECT * INTO v_rule FROM overtime_rules WHERE code = COALESCE(v_event.overtime_rule_code, 'US_FLSA');
  v_fee_pct := COALESCE((SELECT platform_fee_pct FROM event_budgets WHERE event_id = v_event.id), 12);

  -- negotiated direct-book rate wins over the posted call rate
  v_rate := COALESCE(v_assignment.offered_rate, v_shift.hourly_rate);

  v_worked := GREATEST(
    extract(epoch FROM (v_ts.clock_out_at - v_ts.clock_in_at)) / 3600.0 - COALESCE(p_break_minutes, v_ts.break_minutes, 0) / 60.0,
    COALESCE(v_rule.minimum_call_hours, 0));

  -- daily split: regular / OT / DT
  v_dt := CASE WHEN v_rule.daily_dt_after_hours IS NOT NULL THEN GREATEST(v_worked - v_rule.daily_dt_after_hours, 0) ELSE 0 END;
  v_ot := CASE WHEN v_rule.daily_ot_after_hours IS NOT NULL THEN GREATEST(v_worked - v_dt - v_rule.daily_ot_after_hours, 0) ELSE 0 END;
  v_reg := v_worked - v_ot - v_dt;

  -- weekly threshold: hours worked EARLIER this ISO week consume the regular cap,
  -- so approval order cannot shift which shift's hours get the OT rate.
  IF v_rule.weekly_ot_after_hours IS NOT NULL THEN
    -- serialise approvals per worker+company so concurrent calls cannot both read the
    -- same prior total and each pay straight time past the cap
    PERFORM pg_advisory_xact_lock(hashtext('weekly_ot:' || v_ts.worker_id::text || ':' || v_event.company_id::text));
    -- worked hours of sheets clocked in earlier this week (approved ones have
    -- computed hour columns; pending ones are measured off their clock record)
    SELECT COALESCE(sum(COALESCE(
             t.regular_hours + t.overtime_hours + t.doubletime_hours,
             extract(epoch FROM (t.clock_out_at - t.clock_in_at)) / 3600.0 - COALESCE(t.break_minutes, 0) / 60.0
           )), 0) INTO v_prior_weekly
    FROM timesheets t
    JOIN shifts s ON s.id = t.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE t.worker_id = v_ts.worker_id
      AND t.id <> v_ts.id
      AND t.status IN ('submitted', 'approved', 'paid')
      AND e.company_id = v_event.company_id
      AND date_trunc('week', t.clock_in_at) = date_trunc('week', v_ts.clock_in_at)
      AND (t.clock_in_at, t.id) < (v_ts.clock_in_at, v_ts.id);
    v_room := GREATEST(v_rule.weekly_ot_after_hours - v_prior_weekly, 0);
    IF v_reg > v_room THEN
      v_ot := v_ot + (v_reg - v_room);
      v_reg := v_room;
    END IF;
  END IF;

  v_gross := round(v_reg * v_rate + v_ot * v_rate * v_rule.ot_multiplier + v_dt * v_rate * v_rule.dt_multiplier, 2);
  v_fee := round(v_gross * v_fee_pct / 100.0, 2);

  -- === IOU settlement =====================================================
  -- Committed payout-deduction IOUs this worker owes on THIS shift settle out
  -- of the payout, oldest first, whole rows only, capped at 25% of gross so a
  -- worker can never sign away the entire check. Leftover IOUs stay committed
  -- and ride the next approved timesheet for this shift (or void on cancel).
  v_iou_room := round(v_gross * 25);          -- gross dollars -> cap cents
  FOR v_iou IN
    SELECT * FROM crew_iou
    WHERE worker_id = v_ts.worker_id AND shift_id = v_shift.id
      AND status = 'committed' AND settle_via = 'payout_deduction'
    ORDER BY created_at FOR UPDATE
  LOOP
    EXIT WHEN v_iou.amount_cents > v_iou_room;
    UPDATE crew_iou
       SET status = 'settled', settled_at = now(), settled_timesheet_id = v_ts.id, updated_at = now()
     WHERE id = v_iou.id;
    v_iou_room := v_iou_room - v_iou.amount_cents;
    v_iou_cents := v_iou_cents + v_iou.amount_cents;
  END LOOP;
  v_iou_deduction := v_iou_cents / 100.0;
  v_net := v_gross - v_iou_deduction;
  -- ========================================================================

  -- draw the net payout from funded deposits (oldest first); refuse if under-funded
  v_remaining := v_net;
  FOR v_escrow IN
    SELECT * FROM escrow_deposits
    WHERE event_id = v_event.id AND status IN ('funded', 'partially_released')
    ORDER BY created_at FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_escrow.amount - v_escrow.released_amount, v_remaining);
    IF v_take > 0 THEN
      UPDATE escrow_deposits SET
        released_amount = released_amount + v_take,
        status = CASE WHEN released_amount + v_take >= amount THEN 'released'::escrow_status ELSE 'partially_released'::escrow_status END
      WHERE id = v_escrow.id;
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Escrow is short by $%: fund the event escrow before approving', to_char(v_remaining, 'FM999999990.00');
  END IF;

  UPDATE timesheets SET
    break_minutes = COALESCE(p_break_minutes, break_minutes),
    regular_hours = round(v_reg, 2), overtime_hours = round(v_ot, 2), doubletime_hours = round(v_dt, 2),
    gross_pay = v_gross, status = 'approved', approved_by = v_caller, approved_at = now()
  WHERE id = v_ts.id;

  UPDATE shift_assignments SET status = 'completed' WHERE id = v_ts.assignment_id;

  -- the call is done once it has ended and nobody is still booked on it
  UPDATE shifts SET status = 'completed'
  WHERE id = v_shift.id AND ends_at < now() AND status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = v_shift.id AND a.status = 'confirmed');

  INSERT INTO invoices (timesheet_id, worker_id, company_id, event_id, line_items, subtotal, platform_fee, total)
  VALUES (
    v_ts.id, v_ts.worker_id, v_event.company_id, v_event.id,
    jsonb_build_array(
      jsonb_build_object('description', v_shift.role_name || ' – ' || v_shift.title || ' (regular)', 'hours', round(v_reg,2), 'rate', v_rate, 'amount', round(v_reg * v_rate, 2)),
      jsonb_build_object('description', 'Overtime x' || v_rule.ot_multiplier, 'hours', round(v_ot,2), 'rate', v_rate * v_rule.ot_multiplier, 'amount', round(v_ot * v_rate * v_rule.ot_multiplier, 2)),
      jsonb_build_object('description', 'Double time x' || v_rule.dt_multiplier, 'hours', round(v_dt,2), 'rate', v_rate * v_rule.dt_multiplier, 'amount', round(v_dt * v_rate * v_rule.dt_multiplier, 2))
    ) || CASE WHEN v_iou_deduction > 0 THEN jsonb_build_array(
      jsonb_build_object('description', 'Crew share deductions (IOUs)', 'hours', NULL, 'rate', NULL, 'amount', -v_iou_deduction)
    ) ELSE '[]'::jsonb END,
    v_gross, v_fee, v_net
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_net, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  RETURN v_invoice;
END $$;
