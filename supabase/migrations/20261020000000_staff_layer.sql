-- Company OS #3: staff layer — staff_members / staff_assignments.
--
-- Staff are the internal team (PMs, coordinators, crew leads, FOH managers) —
-- distinct from marketplace crew: no Flexzora worker account required, though
-- profile_id can link one later. staff_assignments attach them to events with
-- an on-site role label, alongside (not inside) the shift-assignment crew
-- pipeline, so the event view can show one picture of "everybody working".
--
-- Also extends commit_import_job with the 'staff' target (the enum value was
-- reserved in the import migration) — staff sheets upsert by email so a
-- re-imported roster updates instead of duplicating.

CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,  -- optional Flexzora account link
  full_name text NOT NULL,
  email text,
  phone text,
  title text,                                    -- "Production Manager", "Stage Manager"
  department text,
  employment_type text NOT NULL DEFAULT 'day_rate'
    CHECK (employment_type IN ('salaried', 'day_rate', 'hourly')),
  day_rate numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Email is the dedupe key when present (imports upsert on it).
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_company_email_uniq
  ON staff_members (company_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_members_company_idx ON staff_members (company_id, is_active, full_name);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role_label text,                               -- what they run on this event: "PM", "Site lead"
  call_time timestamptz,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'confirmed', 'declined')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_assignments_uniq
  ON staff_assignments (staff_id, event_id, COALESCE(role_label, ''));
CREATE INDEX IF NOT EXISTS staff_assignments_event_idx ON staff_assignments (event_id, staff_id);
CREATE INDEX IF NOT EXISTS staff_assignments_company_idx ON staff_assignments (company_id, event_id);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff members owner only" ON staff_members;
CREATE POLICY "staff members owner only" ON staff_members FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP POLICY IF EXISTS "staff assignments owner only" ON staff_assignments;
CREATE POLICY "staff assignments owner only" ON staff_assignments FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP TRIGGER IF EXISTS staff_members_updated_at ON staff_members;
CREATE TRIGGER staff_members_updated_at BEFORE UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS staff_assignments_updated_at ON staff_assignments;
CREATE TRIGGER staff_assignments_updated_at BEFORE UPDATE ON staff_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- commit_import_job — same function as the import migration plus the staff
-- branch (upsert by email). Kept as a full CREATE OR REPLACE so there's one
-- authoritative copy of the walker.
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

      ELSIF v_job.target = 'staff' THEN
        -- Staff sheets upsert by email: a re-imported roster updates the
        -- existing member rather than duplicating them.
        IF NULLIF(v_row.mapped ->> 'email', '') IS NOT NULL THEN
          SELECT id INTO v_entity FROM staff_members
          WHERE company_id = v_job.company_id
            AND lower(email) = lower(v_row.mapped ->> 'email');
        END IF;
        IF v_entity IS NOT NULL THEN
          UPDATE staff_members SET
            full_name = COALESCE(NULLIF(v_row.mapped ->> 'full_name', ''), full_name),
            phone = COALESCE(NULLIF(v_row.mapped ->> 'phone', ''), phone),
            title = COALESCE(NULLIF(v_row.mapped ->> 'title', ''), title),
            department = COALESCE(NULLIF(v_row.mapped ->> 'department', ''), department),
            employment_type = COALESCE(NULLIF(v_row.mapped ->> 'employment_type', ''), employment_type),
            day_rate = COALESCE(NULLIF(v_row.mapped ->> 'day_rate', '')::numeric, day_rate),
            notes = COALESCE(NULLIF(v_row.mapped ->> 'notes', ''), notes),
            is_active = true,
            updated_at = now()
          WHERE id = v_entity;
          UPDATE import_rows SET status = 'imported', entity_id = v_entity,
            message = 'updated existing staff member', updated_at = now()
          WHERE id = v_row.id;
          v_imported := v_imported + 1;
          CONTINUE;
        END IF;
        INSERT INTO staff_members (company_id, full_name, email, phone, title,
                                   department, employment_type, day_rate, notes)
        VALUES (
          v_job.company_id,
          v_row.mapped ->> 'full_name',
          NULLIF(v_row.mapped ->> 'email', ''),
          NULLIF(v_row.mapped ->> 'phone', ''),
          NULLIF(v_row.mapped ->> 'title', ''),
          NULLIF(v_row.mapped ->> 'department', ''),
          COALESCE(NULLIF(v_row.mapped ->> 'employment_type', ''), 'day_rate'),
          NULLIF(v_row.mapped ->> 'day_rate', '')::numeric,
          NULLIF(v_row.mapped ->> 'notes', '')
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
