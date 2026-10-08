-- Worker privacy + RLS hardening
-- 1. Precise home coordinates and Stripe Connect details are private to the
--    worker. Hiring companies get distances via a SECURITY DEFINER function —
--    never raw coordinates or payout account ids.
-- 2. Tighten policies flagged in review: assignment consent, venue ownership,
--    blocked-availability visibility, worker_notes immutability.

-- ---------------------------------------------------------------------------
-- worker_sensitive: private per-worker record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_sensitive (
  worker_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  latitude double precision,
  longitude double precision,
  geo geography(Point, 4326),
  stripe_connect_account_id text,
  payouts_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE worker_sensitive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_sensitive self only" ON worker_sensitive;
DROP POLICY IF EXISTS "worker_sensitive self only" ON worker_sensitive;
CREATE POLICY "worker_sensitive self only" ON worker_sensitive FOR ALL TO authenticated
  USING (worker_id = current_profile_id())
  WITH CHECK (worker_id = current_profile_id());

CREATE OR REPLACE FUNCTION worker_sensitive_sync_geo() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geo := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.geo := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS worker_sensitive_sync_geo ON worker_sensitive;
CREATE OR REPLACE TRIGGER worker_sensitive_sync_geo BEFORE INSERT OR UPDATE OF latitude, longitude ON worker_sensitive
  FOR EACH ROW EXECUTE FUNCTION worker_sensitive_sync_geo();
DROP TRIGGER IF EXISTS worker_sensitive_touch ON worker_sensitive;
CREATE OR REPLACE TRIGGER worker_sensitive_touch BEFORE UPDATE ON worker_sensitive FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Copy any already-populated values, then drop the public columns.
INSERT INTO worker_sensitive (worker_id, latitude, longitude, geo, stripe_connect_account_id, payouts_enabled)
SELECT id, latitude, longitude, geo, stripe_connect_account_id, COALESCE(payouts_enabled, false)
FROM profiles
WHERE latitude IS NOT NULL OR stripe_connect_account_id IS NOT NULL OR payouts_enabled IS DISTINCT FROM false
ON CONFLICT (worker_id) DO NOTHING;

ALTER TABLE profiles DROP COLUMN IF EXISTS stripe_connect_account_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS payouts_enabled;
ALTER TABLE profiles DROP COLUMN IF EXISTS geo;
DROP TRIGGER IF EXISTS profiles_sync_geo ON profiles;
ALTER TABLE profiles DROP COLUMN IF EXISTS latitude;
ALTER TABLE profiles DROP COLUMN IF EXISTS longitude;
DROP INDEX IF EXISTS profiles_geo_idx;

-- ---------------------------------------------------------------------------
-- Matching helpers: distance + booked windows without exposing raw data
-- ---------------------------------------------------------------------------

-- Kilometres from a point for each worker — companies score proximity without
-- ever reading the coordinates.
CREATE OR REPLACE FUNCTION worker_distances(p_worker_ids uuid[], p_lat double precision, p_lng double precision)
RETURNS TABLE (worker_id uuid, distance_km double precision)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws.worker_id,
         CASE WHEN ws.geo IS NULL THEN NULL
              ELSE ST_Distance(ws.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0 END
  FROM worker_sensitive ws
  WHERE ws.worker_id = ANY(p_worker_ids)
$$;

-- Whether a worker conflicts with a proposed window: hard = overlapping confirmed
-- booking (any company) or declared unavailable block; buffer = booking inside the
-- turnaround buffer. Companies score availability without ever seeing which
-- competitor has the worker booked or what the block is.
CREATE OR REPLACE FUNCTION worker_conflicts(
  p_worker_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_buffer_minutes integer DEFAULT 60
) RETURNS TABLE (worker_id uuid, hard_conflict boolean, buffer_conflict boolean)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT w.id,
    EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE a.worker_id = w.id AND a.status = 'confirmed'
        AND s.status <> 'cancelled' AND e.status <> 'cancelled'
        AND s.starts_at < p_end AND s.ends_at > p_start
    ) OR EXISTS (
      SELECT 1 FROM availability av
      WHERE av.worker_id = w.id AND av.is_available = false
        AND av.start_time < p_end AND av.end_time > p_start
    ),
    EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE a.worker_id = w.id AND a.status = 'confirmed'
        AND s.status <> 'cancelled' AND e.status <> 'cancelled'
        AND s.starts_at < p_end + make_interval(mins => p_buffer_minutes)
        AND s.ends_at > p_start - make_interval(mins => p_buffer_minutes)
    )
  FROM unnest(p_worker_ids) AS w(id)
$$;

GRANT EXECUTE ON FUNCTION worker_distances(uuid[], double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION worker_conflicts(uuid[], timestamptz, timestamptz, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- SEC: a company may only insert an offer — 'confirmed' requires worker consent
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "workers apply" ON shift_assignments;
DROP POLICY IF EXISTS "workers apply" ON shift_assignments;
CREATE POLICY "workers apply" ON shift_assignments FOR INSERT TO authenticated
  WITH CHECK (
    (worker_id = current_profile_id() AND status = 'applied' AND offered_rate IS NULL
       AND source IN ('roster_broadcast', 'public_marketplace')
       AND worker_can_see_shift(shift_id)
       AND EXISTS (SELECT 1 FROM shifts s WHERE s.id = shift_id AND s.status = 'open'))
    OR (owns_shift(shift_id) AND status = 'offered' AND source IN ('direct_book', 'roster_broadcast')));

CREATE OR REPLACE FUNCTION guard_assignment_insert() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  -- Direct inserts are 'applied' (worker) or 'offered' (company); 'confirmed'
  -- only arrives via UPDATE once the other side agrees.
  IF NEW.status NOT IN ('applied', 'offered') THEN
    RAISE EXCEPTION 'New assignments must start as an application or an offer';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- SEC: a company may only attach venues it owns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION owns_venue(p_venue_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM venues v WHERE v.id = p_venue_id AND owns_company(v.company_id))
$$;
GRANT EXECUTE ON FUNCTION owns_venue(uuid) TO authenticated;

DROP POLICY IF EXISTS "events managed by company" ON events;
DROP POLICY IF EXISTS "events managed by company" ON events;
CREATE POLICY "events managed by company" ON events FOR ALL TO authenticated
  USING (owns_company(company_id))
  WITH CHECK (owns_company(company_id) AND (venue_id IS NULL OR owns_venue(venue_id)));

-- ---------------------------------------------------------------------------
-- SEC: blocked availability only for companies the worker works with
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "companies see blocked availability" ON availability;
DROP POLICY IF EXISTS "companies see blocked availability" ON availability;
CREATE POLICY "companies see blocked availability" ON availability FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR (is_available = false AND (
       EXISTS (SELECT 1 FROM preferred_rosters r
               JOIN companies c ON c.id = r.company_id
               WHERE r.worker_id = availability.worker_id AND c.created_by = current_profile_id())
       OR EXISTS (SELECT 1 FROM shift_assignments a
                  JOIN shifts s ON s.id = a.shift_id
                  JOIN events e ON e.id = s.event_id
                  WHERE a.worker_id = availability.worker_id AND owns_company(e.company_id)))));

-- ---------------------------------------------------------------------------
-- SEC: managers cannot rewrite the worker's own notes
-- ---------------------------------------------------------------------------
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
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Clock, GPS and pay fields are system-managed';
  END IF;

  v_company := owns_shift(OLD.shift_id);

  IF v_company THEN
    IF NEW.worker_notes IS DISTINCT FROM OLD.worker_notes THEN
      RAISE EXCEPTION 'worker_notes belong to the worker';
    END IF;
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

-- ---------------------------------------------------------------------------
-- Weekly OT attributes to the shifts worked latest, not approved latest:
-- prior regular hours = hours worked before this timesheet's clock-in.
-- Function body identical to the original except the v_prior_weekly filter.
-- ---------------------------------------------------------------------------
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
  v_prior_weekly numeric;
  v_room numeric;
  v_reg numeric; v_ot numeric; v_dt numeric;
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
    ),
    v_gross, v_fee, v_gross
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_gross, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  RETURN v_invoice;
END $$;
