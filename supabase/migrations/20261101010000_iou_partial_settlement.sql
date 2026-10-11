-- #28 — IOU settle loop deadlocks the whole queue on the first over-cap IOU.
--
-- approve_timesheet settled committed payout-deduction IOUs "whole rows only"
-- and did `EXIT WHEN v_iou.amount_cents > v_iou_room`. One IOU larger than
-- the 25%-of-gross cap therefore (a) never settled — it can never shrink —
-- and (b) blocked every smaller IOU queued behind it, forever.
--
-- Redesign: PARTIAL SETTLEMENT.
--   * crew_iou.settled_cents tracks how much of the debt has been collected;
--     amount_cents stays the original, immutable debt. Outstanding =
--     amount_cents - settled_cents. status flips to 'settled' only when the
--     outstanding hits zero.
--   * crew_iou_settlements is the append-only ledger of each collection:
--     which timesheet took how much from which IOU, when.
--   * The loop takes min(outstanding, remaining cap) from each IOU, oldest
--     first, and keeps going until the cap is exhausted. Older debt is still
--     never jumped — it just no longer needs to fit whole.
--   * Carry-over: after this shift's IOUs, leftovers from the worker's
--     EARLIER (already ended) shifts settle against the same cap, so a
--     remainder genuinely rides the next payout instead of stranding.
--   * Invoice line items: one line per collection (kind, payee, partial X of
--     Y, carried-over marker) replacing the single aggregate line.
-- Additive: new column (default 0), new table, function body replaced.

ALTER TABLE crew_iou ADD COLUMN IF NOT EXISTS settled_cents integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crew_iou_settled_within_amount') THEN
    ALTER TABLE crew_iou ADD CONSTRAINT crew_iou_settled_within_amount
      CHECK (settled_cents >= 0 AND settled_cents <= amount_cents);
  END IF;
END $$;

-- already-settled rows (whole-row semantics) are fully collected
UPDATE crew_iou SET settled_cents = amount_cents WHERE status = 'settled' AND settled_cents = 0;

CREATE TABLE IF NOT EXISTS crew_iou_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iou_id uuid NOT NULL REFERENCES crew_iou(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  carried_over boolean NOT NULL DEFAULT false,   -- settled from a later shift's payout
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crew_iou_settlements_iou_idx ON crew_iou_settlements (iou_id);
CREATE INDEX IF NOT EXISTS crew_iou_settlements_ts_idx ON crew_iou_settlements (timesheet_id);

ALTER TABLE crew_iou_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iou settlements readable by parties" ON crew_iou_settlements;
CREATE POLICY "iou settlements readable by parties" ON crew_iou_settlements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM crew_iou i
    WHERE i.id = crew_iou_settlements.iou_id
      AND (i.worker_id = current_profile_id()
           OR i.beneficiary_worker_id = current_profile_id()
           OR (i.shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = i.shift_id))))
  ));
-- no INSERT/UPDATE/DELETE policies: rows are written only by approve_timesheet

-- settled_cents is system-managed — extend the party guard so neither the
-- debtor nor the beneficiary can edit it through the API. Also adopt the
-- marketplace-guard convention: definer-context writes (approve_timesheet
-- settling a carry-over IOU from another company's shift) bypass the party
-- check, the same way guard_assignment_update does.
CREATE OR REPLACE FUNCTION guard_crew_iou_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF OLD.shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RETURN NEW;
  END IF;

  IF OLD.worker_id = v_me THEN
    IF OLD.status <> 'committed' THEN RAISE EXCEPTION 'Only committed IOUs can be changed'; END IF;
    IF NEW.status NOT IN ('committed', 'void') THEN RAISE EXCEPTION 'Workers cannot settle their own IOUs'; END IF;
    IF NEW.worker_id <> OLD.worker_id THEN RAISE EXCEPTION 'worker_id cannot change'; END IF;
    IF NEW.settled_at IS NOT NULL OR NEW.settled_timesheet_id IS NOT NULL
       OR NEW.settled_cents IS DISTINCT FROM OLD.settled_cents THEN
      RAISE EXCEPTION 'Settlement fields are system-managed';
    END IF;
    -- a partially collected IOU can no longer be voided by the debtor
    IF NEW.status = 'void' AND OLD.settled_cents > 0 THEN
      RAISE EXCEPTION 'An IOU that has started settling cannot be voided';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.beneficiary_worker_id = v_me AND NEW.beneficiary_worker_id = v_me THEN
    IF OLD.status <> 'committed' OR NEW.status <> 'settled' OR OLD.settle_via <> 'manual' THEN
      RAISE EXCEPTION 'Beneficiary can only mark manual IOUs settled';
    END IF;
    IF NEW.amount_cents <> OLD.amount_cents OR NEW.worker_id <> OLD.worker_id
       OR NEW.kind <> OLD.kind OR NEW.iou_group_id IS DISTINCT FROM OLD.iou_group_id
       OR NEW.settled_cents IS DISTINCT FROM OLD.settled_cents THEN
      RAISE EXCEPTION 'Only status can change when settling a manual IOU';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not a party to this IOU';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- approve_timesheet: full-body replace of the 20261010000000 version. Only
-- the marked settlement block and the invoice line items change.
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
  v_iou record;                      -- crew_iou row + is_carry flag
  v_iou_room integer;
  v_iou_cents integer := 0;
  v_take_cents integer;
  v_iou_lines jsonb := '[]'::jsonb;
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

  -- === IOU settlement (partial, #28) =======================================
  -- Committed payout-deduction IOUs settle out of the payout, oldest first,
  -- capped at 25% of gross so a worker can never sign away the whole check.
  -- Each IOU gives up min(outstanding, remaining cap) — an over-cap IOU now
  -- shrinks instead of freezing the queue, and smaller IOUs behind it still
  -- settle with whatever room is left. Order: this shift's IOUs first, then
  -- carry-overs from the worker's earlier (ended) shifts.
  v_iou_room := round(v_gross * 25);          -- gross dollars -> cap cents
  FOR v_iou IN
    SELECT i.*, (i.shift_id IS DISTINCT FROM v_shift.id) AS is_carry
    FROM crew_iou i
    LEFT JOIN shifts s ON s.id = i.shift_id
    WHERE i.worker_id = v_ts.worker_id
      AND i.status = 'committed' AND i.settle_via = 'payout_deduction'
      AND i.settled_cents < i.amount_cents
      AND (i.shift_id = v_shift.id
           OR (i.shift_id IS NOT NULL AND s.ends_at < now() AND s.status <> 'cancelled'))
    ORDER BY (i.shift_id IS DISTINCT FROM v_shift.id), i.created_at, i.id
    FOR UPDATE OF i
  LOOP
    EXIT WHEN v_iou_room <= 0;
    v_take_cents := LEAST(v_iou.amount_cents - v_iou.settled_cents, v_iou_room);
    CONTINUE WHEN v_take_cents <= 0;

    INSERT INTO crew_iou_settlements (iou_id, timesheet_id, amount_cents, carried_over)
    VALUES (v_iou.id, v_ts.id, v_take_cents, v_iou.is_carry);

    UPDATE crew_iou
       SET settled_cents = settled_cents + v_take_cents,
           status = CASE WHEN settled_cents + v_take_cents >= amount_cents THEN 'settled'::crew_iou_status ELSE status END,
           settled_at = CASE WHEN settled_cents + v_take_cents >= amount_cents THEN now() ELSE settled_at END,
           settled_timesheet_id = CASE WHEN settled_cents + v_take_cents >= amount_cents THEN v_ts.id ELSE settled_timesheet_id END,
           updated_at = now()
     WHERE id = v_iou.id;

    v_iou_lines := v_iou_lines || jsonb_build_object(
      'description',
        'Crew share: ' || v_iou.kind::text
        || COALESCE(' — ' || NULLIF(v_iou.notes, ''), '')
        || CASE WHEN v_iou.settled_cents + v_take_cents < v_iou.amount_cents
                THEN format(' (partial: %s of %s)', to_char(v_take_cents / 100.0, 'FM999999990.00'), to_char(v_iou.amount_cents / 100.0, 'FM999999990.00'))
                WHEN v_iou.settled_cents > 0
                THEN format(' (final %s of %s)', to_char(v_take_cents / 100.0, 'FM999999990.00'), to_char(v_iou.amount_cents / 100.0, 'FM999999990.00'))
                ELSE '' END
        || CASE WHEN v_iou.is_carry THEN ' (carried from earlier call)' ELSE '' END,
      'hours', NULL, 'rate', NULL,
      'amount', -(v_take_cents / 100.0),
      'iou_id', v_iou.id);

    v_iou_room := v_iou_room - v_take_cents;
    v_iou_cents := v_iou_cents + v_take_cents;
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
  INSERT INTO invoices (timesheet_id, worker_id, company_id, event_id, line_items, subtotal, platform_fee, total)
  VALUES (
    v_ts.id, v_ts.worker_id, v_event.company_id, v_event.id,
    jsonb_build_array(
      jsonb_build_object('description', v_shift.role_name || ' – ' || v_shift.title || ' (regular)', 'hours', round(v_reg,2), 'rate', v_rate, 'amount', round(v_reg * v_rate, 2)),
      jsonb_build_object('description', 'Overtime x' || v_rule.ot_multiplier, 'hours', round(v_ot,2), 'rate', v_rate * v_rule.ot_multiplier, 'amount', round(v_ot * v_rate * v_rule.ot_multiplier, 2)),
      jsonb_build_object('description', 'Double time x' || v_rule.dt_multiplier, 'hours', round(v_dt,2), 'rate', v_rate * v_rule.dt_multiplier, 'amount', round(v_dt * v_rate * v_rule.dt_multiplier, 2))
    ) || v_iou_lines,
    v_gross, v_fee, v_net
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_net, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  RETURN v_invoice;
END $$;
