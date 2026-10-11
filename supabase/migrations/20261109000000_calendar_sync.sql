-- Two-way calendar sync: worker pastes a personal iCal feed URL and its busy
-- blocks land in `availability` (is_available=false, tagged to the import).
-- The matcher already counts availability blocks as hard conflicts — synced
-- calendars factor into scoring with zero matching changes. The ical-sync
-- edge function does the fetch+parse; this RPC does the atomic replace so a
-- half-fetched feed never wipes last-known-busy state.

CREATE TABLE IF NOT EXISTS calendar_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Calendar',
  feed_url text NOT NULL,
  synced_at timestamptz,
  block_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (worker_id, feed_url)
);
CREATE INDEX IF NOT EXISTS calendar_imports_worker_idx ON calendar_imports (worker_id);

ALTER TABLE availability
  ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES calendar_imports(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS availability_import_idx ON availability (import_id) WHERE import_id IS NOT NULL;

ALTER TABLE calendar_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers manage own calendar imports" ON calendar_imports;
CREATE POLICY "workers manage own calendar imports" ON calendar_imports FOR ALL TO authenticated
  USING (worker_id = current_profile_id()) WITH CHECK (worker_id = current_profile_id());

-- Companies never see the imported calendar itself — busy blocks only reach
-- them as aggregate conflict counts via worker_travel_conflicts().

CREATE OR REPLACE FUNCTION sync_calendar_import(
  p_import_id uuid,
  p_blocks jsonb DEFAULT '[]'::jsonb,  -- [{start,end,summary}]
  p_error text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_import calendar_imports%ROWTYPE;
  v_block jsonb;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_import FROM calendar_imports WHERE id = p_import_id;
  IF NOT FOUND OR v_import.worker_id <> current_profile_id() THEN
    RAISE EXCEPTION 'Calendar import not found';
  END IF;

  -- Fetch/parse failed upstream: record the error, keep last-known blocks.
  IF p_error IS NOT NULL THEN
    UPDATE calendar_imports SET last_error = p_error WHERE id = p_import_id;
    RETURN -1;
  END IF;

  DELETE FROM availability WHERE import_id = p_import_id;
  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    INSERT INTO availability (worker_id, start_time, end_time, is_available, notes, import_id)
    VALUES (
      v_import.worker_id,
      (v_block ->> 'start')::timestamptz,
      (v_block ->> 'end')::timestamptz,
      false,
      left(coalesce(v_block ->> 'summary', 'Busy (imported)'), 200),
      p_import_id
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE calendar_imports SET synced_at = now(), block_count = v_count, last_error = NULL
  WHERE id = p_import_id;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION sync_calendar_import(uuid, jsonb, text) TO authenticated;
