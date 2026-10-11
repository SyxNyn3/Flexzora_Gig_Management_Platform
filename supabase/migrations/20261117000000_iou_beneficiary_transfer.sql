-- Crew OS deeper: IOU beneficiary transfer — AND a critical repair.
--
-- REPAIR: the union-packs rewrite of approve_timesheet dropped the #28
-- partial-settlement block (crew_iou_settlements ledger, settled_cents,
-- 25%-of-gross cap, net-vs-gross payout) and regressed the weekly-OT prior
-- hours query to the older approved-only form. This restores both.
--
-- FEATURE: settled IOU cents used to evaporate into event escrow. Now each
-- collection also queues an 'iou_transfer' payout to the beneficiary — the
-- existing release-payout edge function pays it to their Connect account the
-- same way it pays timesheet payouts (queued until they've onboarded).

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'timesheet';
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS crew_iou_id uuid REFERENCES crew_iou(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_kind_check') THEN
    ALTER TABLE payouts ADD CONSTRAINT payouts_kind_check CHECK (kind IN ('timesheet', 'iou_transfer'));
  END IF;
END $$;

-- invoice_id was globally UNIQUE (one payout per invoice). Transfers share
-- the debtor's invoice, so the uniqueness narrows to timesheet payouts; one
-- transfer per (IOU, invoice) catches settle-loop retries.
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_invoice_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS payouts_invoice_timesheet_uq
  ON payouts (invoice_id) WHERE kind = 'timesheet';
CREATE UNIQUE INDEX IF NOT EXISTS payouts_iou_invoice_uq
  ON payouts (crew_iou_id, invoice_id) WHERE crew_iou_id IS NOT NULL;

CREATE OR REPLACE FUNCTION approve_timesheet(
  p_timesheet_id uuid,
  p_break_minutes integer DEFAULT NULL,
  p_payout_method text DEFAULT 'ach'
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
  v_iou record;
  v_iou_room integer;
  v_iou_cents integer := 0;
  v_take_cents integer;
  v_iou_lines jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_tr jsonb;
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
  IF v_ts.clock_in_at IS NULL OR v_ts.clock_out_at IS NULL THEN RAISE EXCEPTION 'Timesheet has no clock record'; END IF;

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

  -- === IOU settlement (partial, #28) + beneficiary transfer =================
  -- Committed payout-deduction IOUs settle out of the payout, oldest first,
  -- capped at 25% of gross. Each collection ALSO queues an iou_transfer payout
  -- to the beneficiary — the deducted cents leave escrow to the person owed
  -- instead of pooling there. Order: this shift's IOUs, then carry-overs.
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

    v_transfers := v_transfers || jsonb_build_object(
      'iou', v_iou.id, 'beneficiary', v_iou.beneficiary_worker_id, 'cents', v_take_cents);

    v_iou_room := v_iou_room - v_take_cents;
    v_iou_cents := v_iou_cents + v_take_cents;
  END LOOP;
  v_iou_deduction := v_iou_cents / 100.0;
  v_net := v_gross - v_iou_deduction;
  -- ==========================================================================

  -- the worker nets net; the deductions fund their transfer payouts — the whole
  -- gross leaves escrow between them
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
         'hours', v_turnaround, 'rate', NULL, 'amount', 0)) ELSE '[]'::jsonb END
    || v_iou_lines,
    v_gross, v_fee, v_net
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_net, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  -- transfer payouts: the deducted cents queue for the beneficiaries' Connect
  -- accounts through the same release flow
  FOR v_tr IN SELECT * FROM jsonb_array_elements(v_transfers) LOOP
    INSERT INTO payouts (invoice_id, worker_id, amount, kind, crew_iou_id, method, expected_arrival_at)
    VALUES (v_invoice.id, (v_tr ->> 'beneficiary')::uuid, (v_tr ->> 'cents')::int / 100.0,
            'iou_transfer', (v_tr ->> 'iou')::uuid, 'ach', now() + interval '2 days');
  END LOOP;

  RETURN v_invoice;
END $$;

GRANT EXECUTE ON FUNCTION approve_timesheet(uuid, integer, text) TO authenticated;
