-- Auto-backfill cascade + no-show detection.
--
-- When a booking is lost (decline / withdraw / no-show) the platform immediately
-- re-offers the freed seats to the next-ranked roster candidates — tier order,
-- then reliability, then rating — instead of leaving the gap for a human to
-- notice. When the roster pool is exhausted an urgent ops card is spawned and
-- the company owner is notified so a person can work the public marketplace.
--
-- detect_no_shows() is the sweep-on-read half (same convention as
-- generate_unfilled_tasks): confirmed crew who never clocked in by call+15min
-- flip to no_show, which fires the same cascade through the trigger.

-- ---------------------------------------------------------------------------
-- Ranked candidate search. Roster pool only (tier core > preferred), cert gate,
-- skill + proficiency floor, and nobody already holding a row on this call
-- (declined workers are never re-pinged by the cascade).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_backfill_candidate(p_shift_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cand AS (
    SELECT p.id,
           CASE r.tier WHEN 'core' THEN 0 ELSE 1 END AS tier_rank,
           rel.reliability_rate, rel.avg_rating
    FROM shifts s
    JOIN events e ON e.id = s.event_id
    JOIN preferred_rosters r
      ON r.company_id = e.company_id AND r.tier <> 'blocked'
    JOIN profiles p ON p.id = r.worker_id
    LEFT JOIN LATERAL worker_reliability(p.id) rel ON true
    WHERE s.id = p_shift_id
      AND p.role = 'worker'
      AND worker_meets_shift_certs(p.id, s.id)
      AND (s.skill_id IS NULL OR EXISTS (
            SELECT 1 FROM worker_skills ws
            WHERE ws.worker_id = p.id AND ws.skill_id = s.skill_id
              AND ws.proficiency_level >= s.min_proficiency))
      AND NOT EXISTS (
            SELECT 1 FROM shift_assignments a
            WHERE a.shift_id = s.id AND a.worker_id = p.id)
    ORDER BY tier_rank,
             rel.reliability_rate DESC NULLS LAST,
             rel.avg_rating DESC NULLS LAST,
             p.id
    LIMIT 1
  )
  SELECT id FROM cand;
$$;

-- ---------------------------------------------------------------------------
-- Fill the call's open gap (headcount minus live seats: offered / applied /
-- confirmed) with ranked offers. One call handles a multi-seat loss because
-- each inserted offer removes that worker from the next candidate pick.
-- Returns the number of fresh offers created.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_backfill_shift(p_shift_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_company uuid;
  v_gap integer;
  v_worker uuid;
  v_offered integer := 0;
  v_task uuid;
  v_owner uuid;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND
     OR v_shift.status NOT IN ('open', 'filled', 'in_progress')
     OR v_shift.ends_at <= now() THEN
    RETURN 0;
  END IF;

  SELECT e.company_id, c.created_by INTO v_company, v_owner
  FROM events e JOIN companies c ON c.id = e.company_id
  WHERE e.id = v_shift.event_id;

  v_gap := v_shift.headcount - (
    SELECT count(*) FROM shift_assignments
    WHERE shift_id = p_shift_id AND status IN ('offered', 'applied', 'confirmed'));

  WHILE v_gap > 0 LOOP
    v_worker := next_backfill_candidate(p_shift_id);
    EXIT WHEN v_worker IS NULL;
    INSERT INTO shift_assignments (shift_id, worker_id, source, status)
    VALUES (p_shift_id, v_worker, 'roster_broadcast', 'offered');
    INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
    VALUES (v_worker,
            'Call offer: ' || v_shift.title,
            'A crew spot opened on ' || v_shift.title || ' — first to confirm gets it.',
            'offer', '/calls', jsonb_build_object('shift_id', p_shift_id));
    v_offered := v_offered + 1;
    v_gap := v_gap - 1;
  END LOOP;

  -- Pool exhausted while seats are still open → urgent card + owner heads-up.
  IF v_gap > 0 THEN
    INSERT INTO ops_tasks (company_id, event_id, shift_id, title, notes, priority, source, due_at, sort_order)
    SELECT v_company, v_shift.event_id, p_shift_id,
           'Backfill exhausted: ' || v_shift.title,
           'Roster pool cannot cover ' || v_gap || ' open seat(s). Work the public marketplace or call around.',
           'urgent', 'auto_backfill', v_shift.starts_at,
           floor(extract(epoch from v_shift.starts_at))::integer
    WHERE NOT EXISTS (
      SELECT 1 FROM ops_tasks t
      WHERE t.shift_id = p_shift_id AND t.source = 'auto_backfill' AND t.column_key <> 'done')
    RETURNING id INTO v_task;

    IF v_task IS NOT NULL AND v_owner IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
      VALUES (v_owner,
              'Backfill pool exhausted',
              v_shift.title || ' still needs ' || v_gap || ' crew — no eligible roster candidates left.',
              'warning', '/ops', jsonb_build_object('shift_id', p_shift_id, 'task_id', v_task));
    END IF;
  END IF;

  RETURN v_offered;
END $$;

-- ---------------------------------------------------------------------------
-- The cascade: losing a live seat fires the backfill automatically. Sequential
-- declines chain to the next candidate until seats are covered or the pool
-- runs dry (offers never re-ping a worker who already holds a row).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_backfill_on_seat_loss() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('declined', 'withdrawn', 'no_show')
     AND OLD.status IN ('offered', 'applied', 'confirmed') THEN
    PERFORM auto_backfill_shift(NEW.shift_id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_assignments_backfill ON shift_assignments;
CREATE TRIGGER shift_assignments_backfill AFTER UPDATE OF status ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_backfill_on_seat_loss();

-- ---------------------------------------------------------------------------
-- Sweep-on-read: flip confirmed crew who never clocked in by call+15min to
-- no_show (the trigger above backfills each freed seat) and page the owner.
-- Company-side callers only; window limited to the last 48h so history
-- doesn't re-surface.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_no_shows(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_flagged integer := 0;
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  WITH flagged AS (
    UPDATE shift_assignments a
    SET status = 'no_show', updated_at = now()
    FROM shifts s
    JOIN events e ON e.id = s.event_id
    WHERE a.shift_id = s.id
      AND e.company_id = p_company_id
      AND a.status = 'confirmed'
      AND s.starts_at + interval '15 minutes' < now()
      AND s.starts_at > now() - interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM timesheets t
        WHERE t.assignment_id = a.id AND t.clock_in_at IS NOT NULL)
    RETURNING a.worker_id, a.shift_id
  )
  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  SELECT c.created_by,
         'No-show: ' || s.title,
         p.full_name || ' never clocked in for ' || s.title || ' — backfill offer sent if the roster can cover.',
         'warning', '/events/' || e.id, jsonb_build_object('shift_id', f.shift_id, 'worker_id', f.worker_id)
  FROM flagged f
  JOIN shifts s ON s.id = f.shift_id
  JOIN events e ON e.id = s.event_id
  JOIN companies c ON c.id = e.company_id
  JOIN profiles p ON p.id = f.worker_id
  WHERE c.created_by IS NOT NULL;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;
  RETURN v_flagged;
END $$;

ALTER TABLE ops_tasks DROP CONSTRAINT IF EXISTS ops_tasks_source_check;
ALTER TABLE ops_tasks ADD CONSTRAINT ops_tasks_source_check
  CHECK (source IN ('manual', 'auto_unfilled', 'auto_backfill'));

GRANT EXECUTE ON FUNCTION next_backfill_candidate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_backfill_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_no_shows(uuid) TO authenticated;
