-- Company Copilot: knowledge docs, chat history, and a whitelisted read catalog.
--
-- The copilot never runs free-form SQL. Clients pick a query kind from a fixed
-- catalog and copilot_query() runs it server-side after verifying owns_company —
-- prompt text is treated as data, never authorization. Answers and proposed
-- actions are persisted on copilot_messages so the preview trail is auditable.

-- ---------------------------------------------------------------------------
-- company_docs: unstructured operating knowledge the copilot can cite
-- (rate cards, venue intel, union rules, load-in quirks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_docs_company_idx ON company_docs (company_id, updated_at DESC);

ALTER TABLE company_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company docs owner only" ON company_docs;
CREATE POLICY "company docs owner only" ON company_docs FOR ALL TO authenticated
  USING (owns_company(company_id))
  WITH CHECK (owns_company(company_id));

DROP TRIGGER IF EXISTS company_docs_updated_at ON company_docs;
CREATE TRIGGER company_docs_updated_at BEFORE UPDATE ON company_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- copilot_messages: chat transcript + captured query results + action previews.
-- result/action are snapshots — history shows what the company actually saw.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  query_kind text,                       -- catalog kind that produced `result`
  result jsonb,                          -- snapshot of copilot_query() rows
  action jsonb,                          -- {kind,label,payload,status:pending|done|dismissed,note}
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copilot_messages_company_idx ON copilot_messages (company_id, created_at);

ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "copilot messages owner read" ON copilot_messages;
CREATE POLICY "copilot messages owner read" ON copilot_messages FOR SELECT TO authenticated
  USING (owns_company(company_id));
DROP POLICY IF EXISTS "copilot messages owner write" ON copilot_messages;
CREATE POLICY "copilot messages owner write" ON copilot_messages FOR INSERT TO authenticated
  WITH CHECK (owns_company(company_id) AND (profile_id IS NULL OR profile_id = current_profile_id()));
DROP POLICY IF EXISTS "copilot messages owner update" ON copilot_messages;
CREATE POLICY "copilot messages owner update" ON copilot_messages FOR UPDATE TO authenticated
  USING (owns_company(company_id))
  WITH CHECK (owns_company(company_id));
DROP POLICY IF EXISTS "copilot messages owner delete" ON copilot_messages;
CREATE POLICY "copilot messages owner delete" ON copilot_messages FOR DELETE TO authenticated
  USING (owns_company(company_id));

-- ---------------------------------------------------------------------------
-- copilot_query: the only way the copilot reads operational data. SECURITY
-- DEFINER so it can join across tables workers can't see, but it hard-stops on
-- owns_company() and refuses any kind outside the whitelist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION copilot_query(
  p_company_id uuid,
  p_kind text,
  p_args jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_days integer;
  v_limit integer;
  v_id uuid;
  v_out jsonb;
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  CASE p_kind
  -- Calls needing crew: draft + open shifts whose confirmed headcount is short.
  WHEN 'unfilled_calls' THEN
    v_days := GREATEST(1, LEAST(90, COALESCE((p_args ->> 'days_ahead')::integer, 7)));
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.starts_at), '[]'::jsonb) INTO v_out
    FROM (
      SELECT s.id AS shift_id, e.id AS event_id, e.name AS event_name,
             s.title, s.role_name, s.status, s.starts_at, s.ends_at,
             s.headcount, shift_booked_count(s.id) AS confirmed,
             s.headcount - shift_booked_count(s.id) AS missing
      FROM shifts s
      JOIN events e ON e.id = s.event_id
      WHERE e.company_id = p_company_id
        AND s.status IN ('draft', 'open')
        AND s.starts_at >= now()
        AND s.starts_at < now() + make_interval(days => v_days)
        AND shift_booked_count(s.id) < s.headcount
      ORDER BY s.starts_at
      LIMIT 50
    ) t;

  -- Upcoming events with aggregate fill stats.
  WHEN 'upcoming_events' THEN
    v_days := GREATEST(1, LEAST(180, COALESCE((p_args ->> 'days_ahead')::integer, 14)));
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.starts_on), '[]'::jsonb) INTO v_out
    FROM (
      SELECT e.id AS event_id, e.name, e.status, e.starts_on, e.ends_on,
             v.name AS venue_name,
             count(DISTINCT s.id) AS calls,
             COALESCE(sum(s.headcount), 0)::integer AS seats,
             COALESCE(sum(shift_booked_count(s.id)), 0)::integer AS confirmed
      FROM events e
      LEFT JOIN venues v ON v.id = e.venue_id
      LEFT JOIN shifts s ON s.event_id = e.id
      WHERE e.company_id = p_company_id
        AND e.ends_on >= current_date
        AND e.starts_on <= current_date + make_interval(days => v_days)
      GROUP BY e.id, e.name, e.status, e.starts_on, e.ends_on, v.name
      ORDER BY e.starts_on
      LIMIT 50
    ) t;

  -- Certifications on the company's rosters expiring within N days.
  WHEN 'cert_expiring' THEN
    v_days := GREATEST(1, LEAST(365, COALESCE((p_args ->> 'days')::integer, 30)));
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.expiration_date), '[]'::jsonb) INTO v_out
    FROM (
      SELECT DISTINCT ON (p.id, c.id)
             p.id AS worker_id, p.full_name AS worker_name,
             COALESCE(ct.name, c.name) AS certification,
             c.expiration_date::text,
             (c.expiration_date - current_date) AS days_left
      FROM preferred_rosters pr
      JOIN profiles p ON p.id = pr.worker_id
      JOIN certifications c ON c.worker_id = p.id
      LEFT JOIN certification_types ct ON ct.code = c.cert_type_code
      WHERE pr.company_id = p_company_id
        AND pr.tier <> 'blocked'
        AND c.is_active
        AND c.expiration_date IS NOT NULL
        AND c.expiration_date >= current_date
        AND c.expiration_date <= current_date + make_interval(days => v_days)
      ORDER BY p.id, c.id, c.expiration_date
      LIMIT 100
    ) t;

  -- Timesheets waiting on a manager decision.
  WHEN 'timesheets_pending' THEN
    v_limit := GREATEST(1, LEAST(200, COALESCE((p_args ->> 'limit')::integer, 50)));
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.submitted_order), '[]'::jsonb) INTO v_out
    FROM (
      SELECT ts.id AS timesheet_id, p.full_name AS worker_name,
             e.name AS event_name, s.title AS shift_title,
             s.starts_at, ts.regular_hours, ts.overtime_hours, ts.doubletime_hours,
             ts.gross_pay, ts.updated_at AS submitted_order
      FROM timesheets ts
      JOIN shifts s ON s.id = ts.shift_id
      JOIN events e ON e.id = s.event_id
      JOIN profiles p ON p.id = ts.worker_id
      WHERE e.company_id = p_company_id
        AND ts.status = 'submitted'
      ORDER BY ts.updated_at
      LIMIT v_limit
    ) t;

  -- Commercial picture for one event: cap vs projected and booked labor.
  WHEN 'budget_status' THEN
    v_id := NULLIF(p_args ->> 'event_id', '')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'budget_status requires event_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = v_id AND company_id = p_company_id) THEN
      RAISE EXCEPTION 'Not authorized for this event';
    END IF;
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_out
    FROM (
      SELECT e.id AS event_id, e.name, e.status,
             eb.budget_cap, eb.platform_fee_pct,
             (SELECT round(COALESCE(sum(s2.headcount * s2.hourly_rate *
                    EXTRACT(EPOCH FROM (s2.ends_at - s2.starts_at)) / 3600.0), 0), 2)
              FROM shifts s2 WHERE s2.event_id = e.id) AS projected_labor,
             (SELECT round(COALESCE(sum(s3.hourly_rate *
                    EXTRACT(EPOCH FROM (s3.ends_at - s3.starts_at)) / 3600.0), 0), 2)
              FROM shifts s3
              JOIN shift_assignments sa ON sa.shift_id = s3.id
              WHERE s3.event_id = e.id
                AND sa.status IN ('confirmed', 'completed')) AS booked_labor,
             (SELECT round(COALESCE(sum(ts.gross_pay), 0), 2)
              FROM timesheets ts
              JOIN shifts s4 ON s4.id = ts.shift_id
              WHERE s4.event_id = e.id
                AND ts.status IN ('approved', 'paid')) AS approved_pay
      FROM events e
      LEFT JOIN event_budgets eb ON eb.event_id = e.id
      WHERE e.id = v_id
    ) t;

  -- Confirmed/booked crew on one call.
  WHEN 'crew_for_shift' THEN
    v_id := NULLIF(p_args ->> 'shift_id', '')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'crew_for_shift requires shift_id';
    END IF;
    IF NOT owns_shift(v_id) THEN
      RAISE EXCEPTION 'Not authorized for this shift';
    END IF;
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.worker_name), '[]'::jsonb) INTO v_out
    FROM (
      SELECT sa.id AS assignment_id, p.full_name AS worker_name,
             sa.status, sa.offered_rate, sa.confirmed_at,
             s.title AS shift_title, s.role_name, s.headcount,
             shift_booked_count(s.id) AS confirmed_count
      FROM shift_assignments sa
      JOIN profiles p ON p.id = sa.worker_id
      JOIN shifts s ON s.id = sa.shift_id
      WHERE sa.shift_id = v_id
        AND sa.status IN ('confirmed', 'completed', 'offered', 'applied')
      ORDER BY CASE sa.status WHEN 'confirmed' THEN 0 WHEN 'completed' THEN 1 WHEN 'offered' THEN 2 ELSE 3 END,
               p.full_name
      LIMIT 100
    ) t;

  ELSE
    RAISE EXCEPTION 'Unknown copilot query kind: %', p_kind;
  END CASE;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION copilot_query(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION copilot_query(uuid, text, jsonb) TO authenticated;
