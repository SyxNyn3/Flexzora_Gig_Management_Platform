-- Standby/on-call pools.
--
-- preferred_rosters.tier gains 'standby' + an optional standby_rate. Standby
-- crew are the on-call list: the backfill cascade pings them FIRST (ahead of
-- core), and when a standby_rate is set the auto-offer carries those terms
-- explicitly instead of the call's base rate.

ALTER TABLE preferred_rosters
  ADD COLUMN IF NOT EXISTS standby_rate numeric(10,2)
    CHECK (standby_rate IS NULL OR standby_rate >= 0);

ALTER TABLE preferred_rosters
  DROP CONSTRAINT IF EXISTS preferred_rosters_tier_check;
ALTER TABLE preferred_rosters
  ADD CONSTRAINT preferred_rosters_tier_check
    CHECK (tier IN ('preferred', 'core', 'blocked', 'standby'));

-- Same search as before, but the on-call tier outranks even core on backfill.
CREATE OR REPLACE FUNCTION next_backfill_candidate(p_shift_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cand AS (
    SELECT p.id,
           CASE r.tier WHEN 'standby' THEN 0 WHEN 'core' THEN 1 ELSE 2 END AS tier_rank,
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

-- Identical fill logic; the only change is stamping standby_rate on the offer
-- when the chosen candidate is on-call with a posted rate.
CREATE OR REPLACE FUNCTION auto_backfill_shift(p_shift_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_company uuid;
  v_gap integer;
  v_worker uuid;
  v_rate numeric;
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
    SELECT standby_rate INTO v_rate
    FROM preferred_rosters
    WHERE company_id = v_company AND worker_id = v_worker;
    INSERT INTO shift_assignments (shift_id, worker_id, source, status, offered_rate)
    VALUES (p_shift_id, v_worker, 'roster_broadcast', 'offered', v_rate);
    INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
    VALUES (v_worker,
            'Call offer: ' || v_shift.title,
            'A crew spot opened on ' || v_shift.title || ' — first to confirm gets it.' ||
            CASE WHEN v_rate IS NOT NULL THEN ' Standby rate $' || v_rate || '/hr.' ELSE '' END,
            'offer', '/calls', jsonb_build_object('shift_id', p_shift_id));
    v_offered := v_offered + 1;
    v_gap := v_gap - 1;
  END LOOP;

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
