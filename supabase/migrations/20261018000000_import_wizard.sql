-- Company OS #1: AI Upload Wizard — import_jobs / import_rows.
--
-- A job is one dropped file (CSV/XLSX/PDF) aimed at one import target. The
-- client parses the file, proposes a column->field mapping (LLM with
-- heuristic fallback), then writes one import_row per source row with its
-- normalized `mapped` payload + validation status. commit_import_job()
-- walks the ready/warning rows and inserts them into the target table,
-- capturing per-row DB errors so the review screen can offer
-- fix-and-retry instead of an all-or-nothing import.
--
-- Targets v1: venues, shifts (into a chosen event), roster_contacts
-- (matched to existing worker profiles by email/username). 'staff' is
-- reserved for the staff-layer migration — the enum value lands now so the
-- later commit-function update doesn't need ALTER TYPE inside a tx.
--
-- Also fixes a geofence hole: dropping NOT NULL on venues.lat/lng lets a
-- venue exist without coordinates (imported venue sheets rarely have them).
-- Without the validate_clock_event change below, a NULL venue geo evaluated
-- to "inside the fence" and clock-ins verified without any GPS check — now
-- a coord-less venue accepts the punch but leaves it unverified, same as a
-- shift with no venue at all.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_target') THEN
    CREATE TYPE import_target AS ENUM ('venues', 'shifts', 'roster_contacts', 'staff');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_job_status') THEN
    CREATE TYPE import_job_status AS ENUM ('uploaded', 'mapped', 'reviewing', 'committing', 'committed', 'failed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_row_status') THEN
    CREATE TYPE import_row_status AS ENUM ('pending', 'ready', 'warning', 'error', 'skipped', 'imported');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  target import_target NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,                          -- csv | xlsx | pdf
  status import_job_status NOT NULL DEFAULT 'uploaded',
  source_columns text[] NOT NULL DEFAULT '{}',      -- header row as parsed
  mapping jsonb NOT NULL DEFAULT '{}',              -- {target_field: source_column}
  mapping_source text,                              -- llm | heuristic | manual | saved
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,  -- shifts target only
  stats jsonb NOT NULL DEFAULT '{}',                -- {total, ready, warning, error, skipped, imported}
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE INDEX IF NOT EXISTS import_jobs_company_idx ON import_jobs (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}',                  -- {source_column: cell text}
  mapped jsonb NOT NULL DEFAULT '{}',               -- {field: normalized value}
  status import_row_status NOT NULL DEFAULT 'pending',
  message text,                                     -- validation note / DB error
  entity_id uuid,                                   -- the row this created
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, row_index)
);

CREATE INDEX IF NOT EXISTS import_rows_job_idx ON import_rows (job_id, row_index);

DROP TRIGGER IF EXISTS update_import_rows_updated_at ON import_rows;
CREATE TRIGGER update_import_rows_updated_at BEFORE UPDATE ON import_rows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_jobs owner all" ON import_jobs;
CREATE POLICY "import_jobs owner all" ON import_jobs FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

-- Rows inherit job ownership; owns_company is definer so no RLS recursion.
DROP POLICY IF EXISTS "import_rows owner all" ON import_rows;
CREATE POLICY "import_rows owner all" ON import_rows FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM import_jobs j WHERE j.id = job_id AND owns_company(j.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM import_jobs j WHERE j.id = job_id AND owns_company(j.company_id)));

-- ---------------------------------------------------------------------------
-- Venue coordinates are optional: imported venue lists rarely carry them.
-- Guard the geo sync + clock-in validation so a coord-less venue behaves like
-- an un-geocoded one (punches accepted, never GPS-verified) rather than
-- silently passing the fence check.
-- ---------------------------------------------------------------------------

ALTER TABLE venues ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE venues ALTER COLUMN longitude DROP NOT NULL;

CREATE OR REPLACE FUNCTION sync_venue_geo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geo := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.geo := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_clock_event(
  p_assignment_id uuid,
  p_kind text,                 -- 'in' | 'out'
  p_lat double precision,
  p_lng double precision
) RETURNS timesheets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_assignment shift_assignments%ROWTYPE;
  v_shift shifts%ROWTYPE;
  v_venue venues%ROWTYPE;
  v_distance numeric;
  v_within boolean;
  v_ts timesheets%ROWTYPE;
  v_caller uuid;
BEGIN
  SELECT id INTO v_caller FROM profiles WHERE user_id = auth.uid();
  SELECT * INTO v_assignment FROM shift_assignments WHERE id = p_assignment_id;
  IF v_assignment.id IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF v_assignment.worker_id <> v_caller THEN RAISE EXCEPTION 'Not your assignment'; END IF;
  IF v_assignment.status <> 'confirmed' THEN RAISE EXCEPTION 'Assignment is not confirmed'; END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = v_assignment.shift_id;
  SELECT v.* INTO v_venue FROM venues v JOIN events e ON e.venue_id = v.id WHERE e.id = v_shift.event_id;

  IF v_venue.id IS NULL OR v_venue.geo IS NULL THEN
    v_distance := NULL; v_within := true;  -- venue not geocoded; accept but leave unverified
  ELSE
    v_distance := ST_Distance(v_venue.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography);
    v_within := v_distance <= v_venue.geofence_radius_m;
  END IF;

  INSERT INTO timesheets (assignment_id, shift_id, worker_id)
    VALUES (p_assignment_id, v_shift.id, v_assignment.worker_id)
    ON CONFLICT (assignment_id) DO NOTHING;
  SELECT * INTO v_ts FROM timesheets WHERE assignment_id = p_assignment_id;

  IF p_kind = 'in' THEN
    IF v_ts.clock_in_at IS NOT NULL THEN RAISE EXCEPTION 'Already clocked in'; END IF;
    IF now() < v_shift.starts_at - interval '60 minutes' THEN RAISE EXCEPTION 'Too early to clock in'; END IF;
    IF NOT v_within THEN RAISE EXCEPTION 'Outside venue geofence (% m away, limit % m)', round(v_distance), v_venue.geofence_radius_m; END IF;
    UPDATE timesheets SET clock_in_at = now(), clock_in_lat = p_lat, clock_in_lng = p_lng,
      clock_in_distance_m = v_distance, clock_in_verified = (v_venue.id IS NOT NULL AND v_venue.geo IS NOT NULL)
      WHERE id = v_ts.id RETURNING * INTO v_ts;
  ELSIF p_kind = 'out' THEN
    IF v_ts.clock_in_at IS NULL THEN RAISE EXCEPTION 'Not clocked in'; END IF;
    IF v_ts.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'Already clocked out'; END IF;
    UPDATE timesheets SET clock_out_at = now(), clock_out_lat = p_lat, clock_out_lng = p_lng,
      clock_out_distance_m = v_distance,
      clock_out_verified = (v_venue.id IS NOT NULL AND v_venue.geo IS NOT NULL AND v_within),
      status = 'submitted'
      WHERE id = v_ts.id RETURNING * INTO v_ts;
  ELSE
    RAISE EXCEPTION 'Unknown clock kind %', p_kind;
  END IF;

  RETURN v_ts;
END $$;

-- ---------------------------------------------------------------------------
-- commit_import_job: walk ready/warning rows, insert per target, capture
-- per-row errors. Re-runnable — a row fixed back to 'ready' in the review
-- grid is picked up on the next commit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION commit_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_job import_jobs%ROWTYPE;
  v_row import_rows%ROWTYPE;
  v_entity uuid;
  v_imported int := 0;
  v_failed int := 0;
  v_counts jsonb;
  v_worker uuid;
  v_skill uuid;
  v_certs text[];
  v_bad text[];
  v_token text;
  v_live boolean;
  v_stats jsonb;
BEGIN
  SELECT * INTO v_job FROM import_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF NOT owns_company(v_job.company_id) THEN RAISE EXCEPTION 'Not your import job'; END IF;
  IF v_job.status IN ('committing', 'cancelled') THEN
    RAISE EXCEPTION 'Job is %, cannot commit', v_job.status;
  END IF;

  -- Shifts need a target event owned by the same company.
  IF v_job.target = 'shifts' THEN
    IF v_job.event_id IS NULL THEN RAISE EXCEPTION 'Pick an event to import calls into'; END IF;
    IF NOT owns_event(v_job.event_id) THEN RAISE EXCEPTION 'Not your event'; END IF;
    SELECT status <> 'draft' INTO v_live FROM events WHERE id = v_job.event_id;
  END IF;

  UPDATE import_jobs SET status = 'committing', error = NULL WHERE id = p_job_id;

  FOR v_row IN
    SELECT * FROM import_rows
    WHERE job_id = p_job_id AND status IN ('ready', 'warning')
    ORDER BY row_index
  LOOP
    BEGIN
      v_entity := NULL;

      IF v_job.target = 'venues' THEN
        INSERT INTO venues (company_id, name, address, city, region, country,
                            latitude, longitude, geofence_radius_m, load_in_notes)
        VALUES (
          v_job.company_id,
          v_row.mapped ->> 'name',
          v_row.mapped ->> 'address',
          NULLIF(v_row.mapped ->> 'city', ''),
          NULLIF(v_row.mapped ->> 'region', ''),
          COALESCE(NULLIF(v_row.mapped ->> 'country', ''), 'US'),
          NULLIF(v_row.mapped ->> 'latitude', '')::double precision,
          NULLIF(v_row.mapped ->> 'longitude', '')::double precision,
          COALESCE(NULLIF(v_row.mapped ->> 'geofence_radius_m', '')::integer, 250),
          NULLIF(v_row.mapped ->> 'load_in_notes', '')
        ) RETURNING id INTO v_entity;

      ELSIF v_job.target = 'shifts' THEN
        -- Skill by name (must exist — a miss means the sheet named something
        -- we don't track; that's an error, not a silent drop).
        v_skill := NULL;
        IF NULLIF(v_row.mapped ->> 'skill', '') IS NOT NULL THEN
          SELECT id INTO v_skill FROM skills
          WHERE lower(name) = lower(v_row.mapped ->> 'skill');
          IF v_skill IS NULL THEN
            RAISE EXCEPTION 'Unknown skill: %', v_row.mapped ->> 'skill';
          END IF;
        END IF;

        -- Cert tokens split on , ; | — resolved to codes by code or name.
        v_certs := '{}'; v_bad := '{}';
        IF NULLIF(v_row.mapped ->> 'required_cert_codes', '') IS NOT NULL THEN
          FOREACH v_token IN ARRAY string_to_array(v_row.mapped ->> 'required_cert_codes', E'\x1f')
          LOOP
            v_token := upper(btrim(v_token));
            CONTINUE WHEN v_token = '';
            IF EXISTS (SELECT 1 FROM certification_types WHERE code = v_token) THEN
              v_certs := v_certs || v_token;
            ELSIF EXISTS (SELECT 1 FROM certification_types WHERE upper(name) = v_token OR upper(name) LIKE '%' || v_token || '%') THEN
              v_certs := v_certs || (SELECT code FROM certification_types
                                     WHERE upper(name) = v_token OR upper(name) LIKE '%' || v_token || '%'
                                     ORDER BY length(name) LIMIT 1);
            ELSE
              v_bad := v_bad || v_token;
            END IF;
          END LOOP;
          IF array_length(v_bad, 1) IS NOT NULL THEN
            RAISE EXCEPTION 'Unknown cert code(s): %', array_to_string(v_bad, ', ');
          END IF;
        END IF;

        INSERT INTO shifts (event_id, title, role_name, skill_id, min_proficiency,
                            required_cert_codes, headcount, starts_at, ends_at,
                            hourly_rate, status, broadcast_stage,
                            roster_broadcast_at, notes)
        VALUES (
          v_job.event_id,
          COALESCE(NULLIF(v_row.mapped ->> 'title', ''), v_row.mapped ->> 'role_name'),
          v_row.mapped ->> 'role_name',
          v_skill,
          COALESCE(NULLIF(v_row.mapped ->> 'min_proficiency', '')::integer, 1),
          v_certs,
          COALESCE(NULLIF(v_row.mapped ->> 'headcount', '')::integer, 1),
          (v_row.mapped ->> 'starts_at')::timestamptz,
          (v_row.mapped ->> 'ends_at')::timestamptz,
          (v_row.mapped ->> 'hourly_rate')::numeric,
          CASE WHEN v_live THEN 'open'::shift_status ELSE 'draft'::shift_status END,
          CASE WHEN v_live THEN 'roster' ELSE 'none' END,
          CASE WHEN v_live THEN now() END,
          NULLIF(v_row.mapped ->> 'notes', '')
        ) RETURNING id INTO v_entity;

      ELSIF v_job.target = 'roster_contacts' THEN
        -- Match the contact to a platform worker by email or username.
        SELECT id INTO v_worker FROM profiles
        WHERE role = 'worker'
          AND (lower(email) = lower(v_row.mapped ->> 'email')
               OR lower(username) = lower(v_row.mapped ->> 'email'))
        LIMIT 1;
        IF v_worker IS NULL THEN
          RAISE EXCEPTION 'No Flexzora worker account for % — invite them first (or import as staff)',
            v_row.mapped ->> 'email';
        END IF;
        IF EXISTS (SELECT 1 FROM preferred_rosters
                   WHERE company_id = v_job.company_id AND worker_id = v_worker) THEN
          UPDATE import_rows SET status = 'skipped', message = 'Already on your roster',
            updated_at = now() WHERE id = v_row.id;
          CONTINUE;
        END IF;
        INSERT INTO preferred_rosters (company_id, worker_id, tier, notes, added_by)
        VALUES (
          v_job.company_id, v_worker,
          COALESCE(NULLIF(lower(v_row.mapped ->> 'tier'), ''), 'preferred'),
          NULLIF(v_row.mapped ->> 'notes', ''),
          v_job.created_by
        ) RETURNING id INTO v_entity;

      ELSE
        RAISE EXCEPTION 'Import target % is not supported yet', v_job.target;
      END IF;

      UPDATE import_rows SET status = 'imported', entity_id = v_entity,
        message = COALESCE(message, NULLIF('imported', '')), updated_at = now()
      WHERE id = v_row.id;
      v_imported := v_imported + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE import_rows SET status = 'error', message = SQLERRM, updated_at = now()
      WHERE id = v_row.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  SELECT jsonb_build_object(
    'total', count(*),
    'imported', count(*) FILTER (WHERE status = 'imported'),
    'ready', count(*) FILTER (WHERE status = 'ready'),
    'warning', count(*) FILTER (WHERE status = 'warning'),
    'error', count(*) FILTER (WHERE status = 'error'),
    'skipped', count(*) FILTER (WHERE status = 'skipped')
  ) INTO v_stats FROM import_rows WHERE job_id = p_job_id;

  UPDATE import_jobs
  SET status = 'committed', stats = v_stats, committed_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object('imported', v_imported, 'failed', v_failed, 'stats', v_stats);
END;
$$;

GRANT EXECUTE ON FUNCTION commit_import_job(uuid) TO authenticated;
