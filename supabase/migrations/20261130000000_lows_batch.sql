-- Red-team LOW batch: #54, #42, #41, #40, #39, #35, #33, #32, #46(db half).
--
-- #54 late-cancel flag: withdrawals inside 24h of call now surface as
--     `late_cancels` on worker_reliability.
-- #40 worker_reliability ran INVOKER → RLS filtered the counted rows and
--     understated cross-company reliability → SECURITY DEFINER + pinned path.
-- #42 gig_messages read policy ignored `recipients` → targeted messages were
--     visible to every accepted worker. Recipients gate added.
-- #41 new SECURITY DEFINER functions re-added pg_temp → sweep back to the
--     hardened public, extensions, pg_catalog convention.
-- #39 clock-in opens 60min early and pay ran from clock-in → paid start now
--     caps at shift starts_at unless the company flags early_start_approved.
-- #35 temporal validation on crew tables (future cutoff/departure/check-in,
--     checkout > checkin).
-- #33 departure alert baked raw UTC → formats in events.timezone.
-- #32 swap claimer couldn't re-claim after withdrawing → unique is now
--     partial on live claims.
-- #46 waiting_list.verification_sent_at — the resend fn throttles on it.

-- #54/#40 -------------------------------------------------------------------
DROP FUNCTION IF EXISTS worker_reliability(uuid);
CREATE FUNCTION worker_reliability(p_worker_id uuid)
RETURNS TABLE (completed integer, no_shows integer, withdrawn integer,
               late_cancels integer, reliability_rate numeric, avg_rating numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
  WITH a AS (
    SELECT
      count(*) FILTER (WHERE a.status = 'completed')::integer AS completed,
      count(*) FILTER (WHERE a.status = 'no_show')::integer AS no_shows,
      count(*) FILTER (WHERE a.status = 'withdrawn')::integer AS withdrawn,
      -- withdrawn inside 24h of call start (status is terminal, so updated_at
      -- is the moment they bailed)
      count(*) FILTER (WHERE a.status = 'withdrawn'
        AND a.updated_at <= s.starts_at
        AND a.updated_at >  s.starts_at - interval '24 hours')::integer AS late_cancels
    FROM shift_assignments a
    JOIN shifts s ON s.id = a.shift_id
    WHERE a.worker_id = p_worker_id
  ), r AS (
    SELECT avg(rating)::numeric(3,2) AS avg_rating FROM reviews WHERE reviewee_id = p_worker_id
  )
  SELECT a.completed, a.no_shows, a.withdrawn, a.late_cancels,
    CASE WHEN a.completed + a.no_shows + a.withdrawn = 0 THEN NULL
         ELSE round(a.completed::numeric / (a.completed + a.no_shows + a.withdrawn), 3) END,
    r.avg_rating
  FROM a, r;
$$;
GRANT EXECUTE ON FUNCTION worker_reliability(uuid) TO authenticated;

-- #42 -----------------------------------------------------------------------
DROP POLICY IF EXISTS "gig participants read messages" ON public.gig_messages;
CREATE POLICY "gig participants read messages" ON public.gig_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = gig_id
        AND g.created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR (
      -- broadcast, or the caller is on the recipients list
      ('all' = ANY(recipients)
        OR (SELECT id::text FROM public.profiles WHERE user_id = auth.uid()) = ANY(recipients))
      AND EXISTS (
        SELECT 1 FROM public.gig_applications a
        WHERE a.gig_id = gig_messages.gig_id
          AND a.status = 'accepted'
          AND a.worker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
    )
  );

-- #41 -----------------------------------------------------------------------
-- Sweep every definer fn whose pinned search_path still includes pg_temp back
-- to the hardened triple. Idempotent; extension-owned fns untouched.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
       AND pg_get_userbyid(p.proowner) = current_user
       AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg
                    WHERE cfg LIKE 'search_path=%pg_temp%')
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_catalog',
      fn.proname, fn.identity_args
    );
  END LOOP;
END $$;

-- #39 -----------------------------------------------------------------------
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS early_start_approved boolean NOT NULL DEFAULT false;

-- the flag joins the system-managed block — workers can't self-approve
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
     OR NEW.turnaround_penalty_hours IS DISTINCT FROM OLD.turnaround_penalty_hours
     OR NEW.early_start_approved IS DISTINCT FROM OLD.early_start_approved THEN
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

-- paid time starts at the later of clock-in and call time unless the company
-- explicitly approved the early start — the flag is system-managed (company
-- flips it via the RPC below; workers can't self-approve).
CREATE OR REPLACE FUNCTION set_early_start_approved(p_timesheet_id uuid, p_approved boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT owns_shift((SELECT shift_id FROM timesheets WHERE id = p_timesheet_id)) THEN
    RAISE EXCEPTION 'Only the hiring company can approve early start' USING ERRCODE = '42501';
  END IF;
  UPDATE timesheets SET early_start_approved = p_approved, updated_at = now() WHERE id = p_timesheet_id;
END $$;

CREATE OR REPLACE FUNCTION approve_timesheet(
  p_timesheet_id uuid,
  p_break_minutes integer DEFAULT NULL,
  p_payout_method text DEFAULT 'ach'
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_paid_in timestamptz;
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

  -- #39: the 60-minute clock-in window is for early arrival, not early pay —
  -- paid time starts at call time unless the company approved the early start
  v_paid_in := CASE WHEN v_ts.early_start_approved THEN v_ts.clock_in_at
                    ELSE GREATEST(v_ts.clock_in_at, v_shift.starts_at) END;
  v_raw := extract(epoch FROM (v_ts.clock_out_at - v_paid_in)) / 3600.0
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

    -- only a worker beneficiary can receive a Connect transfer; legacy
    -- free-text `beneficiary` IOUs still settle (their cents stay in escrow
    -- as before this feature existed)
    IF v_iou.beneficiary_worker_id IS NOT NULL THEN
      v_transfers := v_transfers || jsonb_build_object(
        'iou', v_iou.id, 'beneficiary', v_iou.beneficiary_worker_id, 'cents', v_take_cents);
    END IF;

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
GRANT EXECUTE ON FUNCTION set_early_start_approved(uuid, boolean) TO authenticated;

-- #35 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_crew_temporal() RETURNS trigger AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF (v_row ->> 'order_cutoff_at') IS NOT NULL
     AND (v_row ->> 'order_cutoff_at')::timestamptz <= now() THEN
    RAISE EXCEPTION 'The order cutoff must be in the future';
  END IF;
  IF (v_row ->> 'departure_at') IS NOT NULL
     AND (v_row ->> 'departure_at')::timestamptz <= now() THEN
    RAISE EXCEPTION 'Departure must be in the future';
  END IF;
  IF (v_row ->> 'check_in_at') IS NOT NULL
     AND (v_row ->> 'check_in_at')::timestamptz <= now() THEN
    RAISE EXCEPTION 'Check-in must be in the future';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_runs_temporal ON food_runs;
CREATE TRIGGER food_runs_temporal BEFORE INSERT ON food_runs
  FOR EACH ROW EXECUTE FUNCTION check_crew_temporal();
DROP TRIGGER IF EXISTS ride_offers_temporal ON ride_offers;
CREATE TRIGGER ride_offers_temporal BEFORE INSERT ON ride_offers
  FOR EACH ROW EXECUTE FUNCTION check_crew_temporal();
DROP TRIGGER IF EXISTS lodging_pools_temporal ON lodging_pools;
CREATE TRIGGER lodging_pools_temporal BEFORE INSERT ON lodging_pools
  FOR EACH ROW EXECUTE FUNCTION check_crew_temporal();

ALTER TABLE lodging_pools DROP CONSTRAINT IF EXISTS lodging_pools_dates_ordered;
ALTER TABLE lodging_pools ADD CONSTRAINT lodging_pools_dates_ordered
  CHECK (check_in_at IS NULL OR check_out_at IS NULL OR check_out_at > check_in_at);

-- #33 -----------------------------------------------------------------------
-- Departure alert now renders in the event's wall-clock zone, not raw UTC.
CREATE OR REPLACE FUNCTION generate_shift_briefing(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a shift_assignments%ROWTYPE;
  s shifts%ROWTYPE;
  v venues%ROWTYPE;
  gear text;
  distance_m double precision;
  drive_minutes integer;
  v_tz text;
  leave_by timestamptz;
  buddy record;
  v_my_name text;
  v_buddy_assignment uuid;
BEGIN
  SELECT * INTO a FROM shift_assignments WHERE id = p_assignment_id;
  IF NOT FOUND OR a.status <> 'confirmed' THEN
    RETURN;
  END IF;

  SELECT * INTO s FROM shifts WHERE id = a.shift_id;
  SELECT * INTO v FROM venues WHERE id = (SELECT venue_id FROM events WHERE id = s.event_id);
  SELECT timezone INTO v_tz FROM events WHERE id = s.event_id;
  v_tz := COALESCE(v_tz, 'UTC');

  -- Gear checklist: base items + cert-derived items, deduped.
  SELECT string_agg(item, E'\n  • ') INTO gear
  FROM (
    SELECT DISTINCT item
    FROM (
      SELECT item FROM base_gear_items
      UNION
      SELECT g.item FROM cert_gear_items g
      WHERE g.cert_code = ANY (s.required_cert_codes)
    ) all_items
    ORDER BY item
  ) dedup;

  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
  VALUES (
    a.worker_id, a.shift_id, 'gear',
    'Gear check — ' || s.title,
    'Pack for this call:' || E'\n  • ' || coalesce(gear, 'All-black work clothes'),
    a.id,
    'briefing:gear:' || a.id::text
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  -- Parking intel: anything the venue knows about where to put a vehicle.
  IF v.id IS NOT NULL AND (v.overnight_parking OR v.camping_allowed OR v.parking_notes IS NOT NULL OR v.parking_json <> '{}'::jsonb) THEN
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES (
      a.worker_id, a.shift_id, 'parking',
      'Parking at ' || v.name,
      concat_ws(E'\n',
        CASE WHEN v.overnight_parking THEN 'Overnight parking allowed' END,
        CASE WHEN v.camping_allowed THEN 'Camping allowed on site' END,
        v.parking_notes,
        NULLIF(v.parking_json ->> 'crew_lot', ''),
        NULLIF(v.parking_json ->> 'notes', '')
      ),
      a.id,
      'briefing:parking:' || a.id::text
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  -- Departure estimate: worker's private geo -> venue, 55 km/h + 20 min buffer.
  IF v.id IS NOT NULL AND v.geo IS NOT NULL THEN
    SELECT ST_Distance(ws.geo, v.geo) INTO distance_m
    FROM worker_sensitive ws
    WHERE ws.worker_id = a.worker_id AND ws.geo IS NOT NULL;

    IF distance_m IS NOT NULL THEN
      drive_minutes := ceil(distance_m / 1000.0 / 55.0 * 60);
      leave_by := s.starts_at - make_interval(mins => drive_minutes + 20);
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES (
        a.worker_id, a.shift_id, 'departure',
        'Leave by ' || to_char(leave_by AT TIME ZONE v_tz, 'Dy HH24:MI') || ' ' || v_tz,
        format('%s km to %s — about %s min drive + 20 min buffer for %s call.',
          round(distance_m / 1000.0), v.name, drive_minutes, to_char(s.starts_at AT TIME ZONE v_tz, 'HH24:MI')),
        a.id,
        'briefing:departure:' || a.id::text
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  -- Ride buddies: past co-riders confirmed on this call → "same car as last time?"
  FOR buddy IN
    SELECT b.buddy_id, p.full_name, count(*) AS rides,
           (array_agg(b.i_drove ORDER BY b.starts_at DESC))[1] AS i_drove
    FROM (
      SELECT o.driver_worker_id AS buddy_id, false AS i_drove, sh.starts_at
      FROM ride_requests r
      JOIN ride_offers o ON o.id = r.offer_id
      JOIN shifts sh ON sh.id = o.shift_id
      WHERE r.rider_worker_id = a.worker_id AND r.status = 'matched'
      UNION ALL
      SELECT r.rider_worker_id, true, sh.starts_at
      FROM ride_requests r
      JOIN ride_offers o ON o.id = r.offer_id
      JOIN shifts sh ON sh.id = o.shift_id
      WHERE o.driver_worker_id = a.worker_id AND r.status = 'matched'
    ) b
    JOIN profiles p ON p.id = b.buddy_id
    WHERE EXISTS (
      SELECT 1 FROM shift_assignments sa
      WHERE sa.shift_id = a.shift_id AND sa.worker_id = b.buddy_id AND sa.status = 'confirmed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM ride_requests r2 JOIN ride_offers o2 ON o2.id = r2.offer_id
      WHERE o2.shift_id = a.shift_id AND r2.status = 'matched'
        AND ((r2.rider_worker_id = a.worker_id AND o2.driver_worker_id = b.buddy_id)
          OR (r2.rider_worker_id = b.buddy_id AND o2.driver_worker_id = a.worker_id))
    )
    GROUP BY b.buddy_id, p.full_name
  LOOP
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES (
      a.worker_id, a.shift_id, 'ride_buddy',
      'Same car as last time?',
      format('%s %s %s — they''re on this call too.',
        buddy.full_name,
        CASE WHEN buddy.i_drove THEN 'rode with you' ELSE 'drove you' END,
        CASE WHEN buddy.rides = 1 THEN 'once' ELSE buddy.rides || ' times' END),
      buddy.buddy_id,
      'briefing:ridebuddy:' || a.id::text || ':' || buddy.buddy_id::text
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    -- Mirror to the buddy: they confirmed first, so nothing alerts them otherwise.
    SELECT sa.id, p.full_name INTO v_buddy_assignment, v_my_name
    FROM shift_assignments sa, profiles p
    WHERE sa.shift_id = a.shift_id AND sa.worker_id = buddy.buddy_id AND sa.status = 'confirmed'
      AND p.id = a.worker_id
    LIMIT 1;
    IF v_buddy_assignment IS NOT NULL THEN
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES (
        buddy.buddy_id, a.shift_id, 'ride_buddy',
        'Same car as last time?',
        format('%s %s %s — they''re on this call too.',
          v_my_name,
          CASE WHEN buddy.i_drove THEN 'drove you' ELSE 'rode with you' END,
          CASE WHEN buddy.rides = 1 THEN 'once' ELSE buddy.rides || ' times' END),
        a.worker_id,
        'briefing:ridebuddy:' || v_buddy_assignment::text || ':' || a.worker_id::text
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- #32 -----------------------------------------------------------------------
-- A withdrawn claim no longer blocks re-entry — uniqueness is on LIVE claims.
ALTER TABLE swap_claims DROP CONSTRAINT IF EXISTS swap_claims_swap_request_id_claimer_worker_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS swap_claims_live_claimer_uq
  ON swap_claims (swap_request_id, claimer_worker_id)
  WHERE status IN ('pending', 'accepted');

-- #46 (db half) --------------------------------------------------------------
ALTER TABLE waiting_list ADD COLUMN IF NOT EXISTS verification_sent_at timestamptz;
