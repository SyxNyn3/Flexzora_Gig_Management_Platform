-- Company OS #8: company_alerts — the automatic reminders inbox.
--
-- A production office runs on "things about to go wrong". This lane turns the
-- existing signals (unfilled calls, certs expiring on booked crew, timesheets
-- waiting on approval, calls landing tomorrow) into one deduped inbox.
-- generate_company_alerts() is an idempotent sweep: it opens alerts for live
-- conditions, escalates severity as deadlines approach, and auto-resolves
-- alerts whose condition cleared — the inbox mirrors reality like the ops
-- board does, without anyone maintaining it.

CREATE TABLE IF NOT EXISTS company_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'unfilled_call',       -- call short-staffed with the clock running
    'cert_expiring',       -- booked crew's required cert lapses before the call
    'timesheet_pending',   -- submitted timesheet waiting on approval
    'shift_tomorrow'       -- fully-booked call lands inside 24h — last sanity check
  )),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  title text NOT NULL,
  body text,
  -- one open alert per condition; the sweep re-finds it by this key
  dedupe_key text,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  timesheet_id uuid REFERENCES timesheets(id) ON DELETE SET NULL,
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS company_alerts_company_idx ON company_alerts (company_id, status, severity);
CREATE INDEX IF NOT EXISTS company_alerts_shift_idx ON company_alerts (shift_id) WHERE status = 'open';

ALTER TABLE company_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company alerts owner all" ON company_alerts;
CREATE POLICY "company alerts owner all" ON company_alerts FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP TRIGGER IF EXISTS company_alerts_updated_at ON company_alerts;
CREATE TRIGGER company_alerts_updated_at BEFORE UPDATE ON company_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- generate_company_alerts: idempotent sweep over all signal kinds.
-- Safe to call on every inbox load.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_company_alerts(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_opened int := 0;
  v_resolved int := 0;
  v_row record;
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  -- ----- Auto-resolve: conditions that cleared since the last sweep. --------
  WITH gone AS (
    UPDATE company_alerts a
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE a.company_id = p_company_id AND a.status = 'open' AND (
      (a.kind = 'unfilled_call' AND NOT EXISTS (
        SELECT 1 FROM shifts s WHERE s.id = a.shift_id
          AND s.status IN ('draft', 'open')
          AND s.starts_at >= now() - interval '4 hours'
          AND shift_booked_count(s.id) < s.headcount))
      OR (a.kind = 'timesheet_pending' AND NOT EXISTS (
        SELECT 1 FROM timesheets t WHERE t.id = a.timesheet_id AND t.status = 'submitted'))
      OR (a.kind = 'shift_tomorrow' AND NOT EXISTS (
        SELECT 1 FROM shifts s WHERE s.id = a.shift_id
          AND s.status NOT IN ('cancelled')
          AND s.starts_at >= now() AND s.starts_at <= now() + interval '24 hours'))
      OR (a.kind = 'cert_expiring' AND a.shift_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM shifts s WHERE s.id = a.shift_id
          AND s.status NOT IN ('cancelled', 'completed')
          AND s.starts_at >= now()))
    )
    RETURNING a.id
  )
  SELECT count(*) INTO v_resolved FROM gone;

  -- ----- Escalate: unfilled calls inside 48h are urgent. --------------------
  UPDATE company_alerts a
  SET severity = 'urgent', updated_at = now()
  FROM shifts s
  WHERE a.company_id = p_company_id AND a.kind = 'unfilled_call'
    AND a.status = 'open' AND a.severity <> 'urgent'
    AND a.shift_id = s.id AND s.starts_at <= now() + interval '48 hours';

  -- ----- Open: unfilled calls in the next 14 days. --------------------------
  FOR v_row IN
    SELECT s.id AS shift_id, s.title, s.role_name, s.headcount, s.starts_at,
           s.event_id, e.name AS event_name,
           s.headcount - shift_booked_count(s.id) AS missing
    FROM shifts s JOIN events e ON e.id = s.event_id
    WHERE e.company_id = p_company_id
      AND s.status IN ('draft', 'open')
      AND s.starts_at >= now() - interval '4 hours'
      AND s.starts_at <= now() + interval '14 days'
      AND shift_booked_count(s.id) < s.headcount
    ORDER BY s.starts_at LIMIT 50
  LOOP
    INSERT INTO company_alerts (company_id, kind, severity, title, body,
                                dedupe_key, event_id, shift_id, due_at)
    VALUES (
      p_company_id, 'unfilled_call',
      CASE WHEN v_row.starts_at <= now() + interval '48 hours' THEN 'urgent' ELSE 'warning' END,
      format('%s of %s seats open — %s', v_row.missing, v_row.headcount, v_row.title),
      format('%s · %s · %s', v_row.event_name, v_row.role_name,
             to_char(v_row.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC'),
      'unfilled:' || v_row.shift_id, v_row.event_id, v_row.shift_id, v_row.starts_at)
    ON CONFLICT (company_id, dedupe_key) DO NOTHING;
    IF found THEN v_opened := v_opened + 1; END IF;
  END LOOP;

  -- ----- Open: certs expiring on crew booked to this company's calls. -------
  FOR v_row IN
    SELECT c.id AS cert_id, c.name AS cert_name, c.expiration_date,
           p.full_name AS worker_name, s.id AS shift_id, s.title AS shift_title,
           s.event_id, s.starts_at
    FROM certifications c
    JOIN shift_assignments a ON a.worker_id = c.worker_id
      AND a.status IN ('confirmed', 'completed')
    JOIN shifts s ON s.id = a.shift_id AND s.status NOT IN ('cancelled', 'completed')
    JOIN events e ON e.id = s.event_id
    JOIN profiles p ON p.id = c.worker_id
    WHERE e.company_id = p_company_id
      AND c.is_active AND c.expiration_date IS NOT NULL
      AND c.expiration_date <= (now() + interval '30 days')::date
      AND s.starts_at >= now()
    ORDER BY c.expiration_date LIMIT 100
  LOOP
    INSERT INTO company_alerts (company_id, kind, severity, title, body,
                                dedupe_key, event_id, shift_id, due_at)
    VALUES (
      p_company_id, 'cert_expiring',
      CASE WHEN v_row.expiration_date <= (now() + interval '7 days')::date THEN 'urgent' ELSE 'warning' END,
      format('%s — %s expires %s', v_row.worker_name, v_row.cert_name, v_row.expiration_date),
      format('Booked on %s · %s', v_row.shift_title, to_char(v_row.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon')),
      'cert:' || v_row.cert_id || ':' || v_row.shift_id,
      v_row.event_id, v_row.shift_id, v_row.expiration_date::timestamptz)
    ON CONFLICT (company_id, dedupe_key) DO NOTHING;
    IF found THEN v_opened := v_opened + 1; END IF;
  END LOOP;

  -- ----- Open: timesheets submitted >48h ago still waiting. -----------------
  FOR v_row IN
    SELECT t.id AS timesheet_id, COALESCE(t.clock_out_at, t.created_at) AS submitted_at,
           p.full_name AS worker_name,
           s.id AS shift_id, s.title AS shift_title, s.event_id, e.name AS event_name
    FROM timesheets t
    JOIN shifts s ON s.id = t.shift_id
    JOIN events e ON e.id = s.event_id
    JOIN profiles p ON p.id = t.worker_id
    WHERE e.company_id = p_company_id
      AND t.status = 'submitted'
      AND COALESCE(t.clock_out_at, t.created_at) <= now() - interval '48 hours'
    ORDER BY COALESCE(t.clock_out_at, t.created_at) LIMIT 50
  LOOP
    INSERT INTO company_alerts (company_id, kind, severity, title, body,
                                dedupe_key, event_id, shift_id, timesheet_id, due_at)
    VALUES (
      p_company_id, 'timesheet_pending', 'warning',
      format('Timesheet waiting — %s', v_row.worker_name),
      format('%s · %s · submitted %s', v_row.event_name, v_row.shift_title,
             to_char(v_row.submitted_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC'),
      'timesheet:' || v_row.timesheet_id, v_row.event_id, v_row.shift_id,
      v_row.timesheet_id, v_row.submitted_at + interval '24 hours')
    ON CONFLICT (company_id, dedupe_key) DO NOTHING;
    IF found THEN v_opened := v_opened + 1; END IF;
  END LOOP;

  -- ----- Open: fully-booked calls landing inside 24h. -----------------------
  FOR v_row IN
    SELECT s.id AS shift_id, s.title, s.role_name, s.headcount, s.starts_at,
           s.event_id, e.name AS event_name
    FROM shifts s JOIN events e ON e.id = s.event_id
    WHERE e.company_id = p_company_id
      AND s.status = 'filled'
      AND s.starts_at >= now() AND s.starts_at <= now() + interval '24 hours'
      AND shift_booked_count(s.id) >= s.headcount
    ORDER BY s.starts_at LIMIT 50
  LOOP
    INSERT INTO company_alerts (company_id, kind, severity, title, body,
                                dedupe_key, event_id, shift_id, due_at)
    VALUES (
      p_company_id, 'shift_tomorrow', 'info',
      format('Locked call inside 24h — %s', v_row.title),
      format('%s · %s · %s of %s crew · %s UTC', v_row.event_name, v_row.role_name,
             v_row.headcount, v_row.headcount,
             to_char(v_row.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI')),
      'tomorrow:' || v_row.shift_id, v_row.event_id, v_row.shift_id, v_row.starts_at)
    ON CONFLICT (company_id, dedupe_key) DO NOTHING;
    IF found THEN v_opened := v_opened + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('opened', v_opened, 'resolved', v_resolved);
END $$;

GRANT EXECUTE ON FUNCTION generate_company_alerts(uuid) TO authenticated;
