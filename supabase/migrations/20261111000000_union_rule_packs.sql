-- Union/local rule packs: meal penalties + turnaround pay.
--
-- overtime_rules already carried an unused meal_penalty_after_hours column.
-- This wires it (CA-style: worked past the threshold without a real meal
-- break → one extra hour at straight time) and adds the turnaround floor
-- union locals enforce (minimum rest between calls — hours worked before
-- the rest completes bill at double time instead of regular).
--
-- Penalties are recorded on the timesheet (audit columns, system-managed)
-- and itemized on the invoice so the worker sees exactly what drove the pay.

ALTER TABLE overtime_rules
  ADD COLUMN IF NOT EXISTS turnaround_min_hours numeric(4,2),
  ADD COLUMN IF NOT EXISTS meal_break_min_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS meal_penalty_hours numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turnaround_penalty_hours numeric(5,2) NOT NULL DEFAULT 0;

-- The two audit columns join the system-managed block in the update guard.
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
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.meal_penalty_hours IS DISTINCT FROM OLD.meal_penalty_hours
     OR NEW.turnaround_penalty_hours IS DISTINCT FROM OLD.turnaround_penalty_hours THEN
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

-- approve_timesheet: same body as marketplace_core plus the meal/turnaround
-- blocks (marked) and penalty line items on the invoice.
CREATE OR REPLACE FUNCTION approve_timesheet(
  p_timesheet_id uuid,
  p_break_minutes integer DEFAULT NULL,
  p_payout_method text DEFAULT 'ach'
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  v_raw numeric;
  v_prior_weekly numeric;
  v_room numeric;
  v_reg numeric; v_ot numeric; v_dt numeric;
  v_meal_pen numeric := 0;
  v_turnaround numeric := 0;
  v_prior_end timestamptz;
  v_gap_hours numeric;
  v_gross numeric; v_fee numeric;
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

  v_raw := extract(epoch FROM (v_ts.clock_out_at - v_ts.clock_in_at)) / 3600.0
           - COALESCE(p_break_minutes, v_ts.break_minutes, 0) / 60.0;
  v_worked := GREATEST(v_raw, COALESCE(v_rule.minimum_call_hours, 0));

  -- daily split: regular / OT / DT
  v_dt := CASE WHEN v_rule.daily_dt_after_hours IS NOT NULL THEN GREATEST(v_worked - v_rule.daily_dt_after_hours, 0) ELSE 0 END;
  v_ot := CASE WHEN v_rule.daily_ot_after_hours IS NOT NULL THEN GREATEST(v_worked - v_dt - v_rule.daily_ot_after_hours, 0) ELSE 0 END;
  v_reg := v_worked - v_ot - v_dt;

  -- weekly threshold: regular hours already approved for this company in the same
  -- ISO workweek consume the cap; the remainder of this shift is promoted to OT.
  IF v_rule.weekly_ot_after_hours IS NOT NULL THEN
    -- serialise approvals per worker+company so concurrent calls cannot both read the
    -- same prior total and each pay straight time past the cap
    PERFORM pg_advisory_xact_lock(hashtext('weekly_ot:' || v_ts.worker_id::text || ':' || v_event.company_id::text));
    SELECT COALESCE(sum(t.regular_hours), 0) INTO v_prior_weekly
    FROM timesheets t
    JOIN shifts s ON s.id = t.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE t.worker_id = v_ts.worker_id
      AND t.id <> v_ts.id
      AND t.status IN ('approved', 'paid')
      AND e.company_id = v_event.company_id
      AND date_trunc('week', t.clock_in_at) = date_trunc('week', v_ts.clock_in_at);
    v_room := GREATEST(v_rule.weekly_ot_after_hours - v_prior_weekly, 0);
    IF v_reg > v_room THEN
      v_ot := v_ot + (v_reg - v_room);
      v_reg := v_room;
    END IF;
  END IF;

  -- UNION PACK: meal penalty — worked past meal_penalty_after_hours without a
  -- real meal break (>= meal_break_min_minutes) → one extra hour at straight
  -- time (CA-style premium). The raw stretch triggers it, not the clamped call.
  IF v_rule.meal_penalty_after_hours IS NOT NULL
     AND v_raw > v_rule.meal_penalty_after_hours
     AND COALESCE(p_break_minutes, v_ts.break_minutes, 0) < v_rule.meal_break_min_minutes THEN
    v_meal_pen := 1;
  END IF;

  -- UNION PACK: turnaround — the company scheduled this call less than
  -- turnaround_min_hours after the worker's prior call with them ended.
  -- Hours worked before the rest floor completes bill at double time
  -- (the early hours are always regular hours, so they move reg→dt).
  IF v_rule.turnaround_min_hours IS NOT NULL THEN
    SELECT max(s.ends_at) INTO v_prior_end
    FROM shift_assignments a
    JOIN shifts s ON s.id = a.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE a.worker_id = v_ts.worker_id
      AND a.id <> v_ts.assignment_id
      AND a.status IN ('confirmed', 'completed')
      AND s.status <> 'cancelled' AND e.status <> 'cancelled'
      AND e.company_id = v_event.company_id
      AND s.ends_at <= v_ts.clock_in_at;
    IF v_prior_end IS NOT NULL THEN
      v_gap_hours := extract(epoch FROM (v_ts.clock_in_at - v_prior_end)) / 3600.0;
      IF v_gap_hours < v_rule.turnaround_min_hours THEN
        v_turnaround := LEAST(v_worked, v_rule.turnaround_min_hours - v_gap_hours);
        v_dt := v_dt + LEAST(v_reg, v_turnaround);
        v_reg := v_reg - LEAST(v_reg, v_turnaround);
      END IF;
    END IF;
  END IF;

  v_gross := round(v_reg * v_rate + v_ot * v_rate * v_rule.ot_multiplier + v_dt * v_rate * v_rule.dt_multiplier
                   + v_meal_pen * v_rate, 2);
  v_fee := round(v_gross * v_fee_pct / 100.0, 2);

  -- draw the gross from funded deposits (oldest first); refuse if under-funded
  v_remaining := v_gross;
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
    meal_penalty_hours = v_meal_pen, turnaround_penalty_hours = v_turnaround,
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
    )
    || CASE WHEN v_meal_pen > 0 THEN jsonb_build_array(jsonb_build_object(
         'description', 'Meal penalty (no ' || v_rule.meal_break_min_minutes || 'min break in ' || v_rule.meal_penalty_after_hours || 'h)',
         'hours', v_meal_pen, 'rate', v_rate, 'amount', round(v_meal_pen * v_rate, 2))) ELSE '[]'::jsonb END
    || CASE WHEN v_turnaround > 0 THEN jsonb_build_array(jsonb_build_object(
         'description', 'Turnaround premium — ' || v_turnaround || 'h before the ' || v_rule.turnaround_min_hours || 'h rest floor bills as double time',
         'hours', v_turnaround, 'rate', NULL, 'amount', 0)) ELSE '[]'::jsonb END,
    v_gross, v_fee, v_gross
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_gross, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  RETURN v_invoice;
END $$;

GRANT EXECUTE ON FUNCTION approve_timesheet(uuid, integer, text) TO authenticated;

-- Seed the union packs. IATSE_STD gains the standard 8h turnaround floor;
-- Local 16 (SF) is the stricter pack companies pick for Bay-Area calls.
UPDATE overtime_rules SET turnaround_min_hours = 8 WHERE code = 'IATSE_STD';
INSERT INTO overtime_rules (code, name, region, daily_ot_after_hours, daily_dt_after_hours,
                            weekly_ot_after_hours, ot_multiplier, dt_multiplier,
                            minimum_call_hours, meal_penalty_after_hours,
                            turnaround_min_hours, meal_break_min_minutes)
VALUES ('IATSE_LOCAL_16', 'IATSE Local 16 (San Francisco)', 'US-CA', 8, 12, 40, 1.5, 2.0, 5, 5, 9, 30)
ON CONFLICT (code) DO NOTHING;
