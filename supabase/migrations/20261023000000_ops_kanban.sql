-- Company OS #6: operations kanban — ops_tasks + auto urgent cards.
--
-- The board a production office lives on: manual tasks plus generated
-- "unfilled call" urgencies. generate_unfilled_tasks() is idempotent — it
-- creates one urgent card per short-staffed upcoming call (linked to the
-- shift) and auto-completes cards whose call filled since the last sweep,
-- so the board always mirrors reality without anyone maintaining it.

CREATE TABLE IF NOT EXISTS ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text,
  column_key text NOT NULL DEFAULT 'todo'
    CHECK (column_key IN ('todo', 'in_progress', 'done')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_unfilled')),
  assigned_staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  due_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  done_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_tasks_company_idx ON ops_tasks (company_id, column_key, sort_order);
CREATE INDEX IF NOT EXISTS ops_tasks_shift_idx ON ops_tasks (shift_id) WHERE column_key <> 'done';

ALTER TABLE ops_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ops tasks owner all" ON ops_tasks;
CREATE POLICY "ops tasks owner all" ON ops_tasks FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP TRIGGER IF EXISTS ops_tasks_updated_at ON ops_tasks;
CREATE TRIGGER ops_tasks_updated_at BEFORE UPDATE ON ops_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- generate_unfilled_tasks: one urgent card per short-staffed upcoming call.
-- Idempotent — safe to call on every board load.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_unfilled_tasks(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_created int := 0;
  v_resolved int := 0;
  v_shift record;
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  -- Cards whose call filled (or cancelled) since the sweep → done.
  WITH done_tasks AS (
    UPDATE ops_tasks t
    SET column_key = 'done', done_at = now(), updated_at = now()
    FROM shifts s
    WHERE t.shift_id = s.id
      AND t.source = 'auto_unfilled'
      AND t.column_key <> 'done'
      AND (s.status IN ('filled', 'completed', 'cancelled', 'in_progress')
           OR shift_booked_count(s.id) >= s.headcount)
    RETURNING t.id
  )
  SELECT count(*) INTO v_resolved FROM done_tasks;

  -- Short-staffed calls starting within 14 days without an open card.
  FOR v_shift IN
    SELECT s.id, s.title, s.role_name, s.headcount, s.starts_at, s.event_id,
           e.name AS event_name,
           s.headcount - shift_booked_count(s.id) AS missing
    FROM shifts s
    JOIN events e ON e.id = s.event_id
    WHERE e.company_id = p_company_id
      AND s.status IN ('draft', 'open')
      AND s.starts_at >= now() - interval '4 hours'
      AND s.starts_at <= now() + interval '14 days'
      AND shift_booked_count(s.id) < s.headcount
      AND NOT EXISTS (
        SELECT 1 FROM ops_tasks t
        WHERE t.shift_id = s.id AND t.source = 'auto_unfilled' AND t.column_key <> 'done'
      )
    ORDER BY s.starts_at
    LIMIT 50
  LOOP
    INSERT INTO ops_tasks (company_id, event_id, shift_id, title, notes,
                           column_key, priority, source, due_at, sort_order)
    VALUES (
      p_company_id, v_shift.event_id, v_shift.id,
      format('Crew %s — %s more needed', v_shift.title, v_shift.missing),
      format('%s · %s · %s of %s seats open',
             v_shift.event_name, v_shift.role_name, v_shift.missing, v_shift.headcount),
      'todo', 'urgent', 'auto_unfilled',
      v_shift.starts_at - interval '12 hours',
      EXTRACT(EPOCH FROM v_shift.starts_at)::integer  -- urgent cards sort by call time
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

GRANT EXECUTE ON FUNCTION generate_unfilled_tasks(uuid) TO authenticated;
