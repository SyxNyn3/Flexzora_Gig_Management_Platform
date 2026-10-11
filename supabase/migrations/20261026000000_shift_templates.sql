-- Lane B #2: shift templates ("call packs").
--
-- Every company rebuilds the same calls: an arena load-in is always 8 riggers,
-- ETCP-gated, $52/hr, 8 hours. A call pack captures that bundle once —
-- role + headcount + cert gates + rate + typical length — so creating the call
-- is pick-the-pack, set the time, done. The Import Wizard gains a
-- `shift_templates` target so an existing rate-card spreadsheet becomes packs.

-- Wizard enum gains the pack target (idempotent on PG12+).
ALTER TYPE import_target ADD VALUE IF NOT EXISTS 'shift_templates';

CREATE TABLE IF NOT EXISTS shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role_name text NOT NULL,
  skill_id uuid REFERENCES skills(id) ON DELETE SET NULL,
  min_proficiency integer NOT NULL DEFAULT 1 CHECK (min_proficiency BETWEEN 1 AND 5),
  required_cert_codes text[] NOT NULL DEFAULT '{}',
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount > 0),
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  duration_minutes integer NOT NULL DEFAULT 480 CHECK (duration_minutes > 0),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS shift_templates_company_idx ON shift_templates (company_id, name);

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift templates owner all" ON shift_templates;
CREATE POLICY "shift templates owner all" ON shift_templates FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP TRIGGER IF EXISTS shift_templates_updated_at ON shift_templates;
CREATE TRIGGER shift_templates_updated_at BEFORE UPDATE ON shift_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Import target: 'shift_templates' branch in commit_import_job — same walker
-- as the staff-layer version plus the new branch (upserts by company+name).
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

      ELSIF v_job.target = 'shift_templates' THEN
        -- Rate-card sheets become call packs. Cert tokens resolve exactly the
        -- way the shifts branch does (code or fuzzy name).
        v_skill := NULL;
        IF NULLIF(v_row.mapped ->> 'skill', '') IS NOT NULL THEN
          SELECT id INTO v_skill FROM skills
          WHERE lower(name) = lower(v_row.mapped ->> 'skill');
          IF v_skill IS NULL THEN
            RAISE EXCEPTION 'Unknown skill: %', v_row.mapped ->> 'skill';
          END IF;
        END IF;
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
        INSERT INTO shift_templates (company_id, name, role_name, skill_id,
                                     min_proficiency, required_cert_codes, headcount,
                                     hourly_rate, duration_minutes, notes)
        VALUES (
          v_job.company_id,
          COALESCE(NULLIF(v_row.mapped ->> 'name', ''), v_row.mapped ->> 'role_name'),
          v_row.mapped ->> 'role_name',
          v_skill,
          COALESCE(NULLIF(v_row.mapped ->> 'min_proficiency', '')::integer, 1),
          v_certs,
          COALESCE(NULLIF(v_row.mapped ->> 'headcount', '')::integer, 1),
          COALESCE(NULLIF(v_row.mapped ->> 'hourly_rate', '')::numeric, 0),
          COALESCE(NULLIF(v_row.mapped ->> 'duration_minutes', '')::integer, 480),
          NULLIF(v_row.mapped ->> 'notes', '')
        )
        ON CONFLICT (company_id, name) DO UPDATE SET
          role_name = EXCLUDED.role_name,
          skill_id = COALESCE(EXCLUDED.skill_id, shift_templates.skill_id),
          min_proficiency = EXCLUDED.min_proficiency,
          required_cert_codes = EXCLUDED.required_cert_codes,
          headcount = EXCLUDED.headcount,
          hourly_rate = EXCLUDED.hourly_rate,
          duration_minutes = EXCLUDED.duration_minutes,
          notes = COALESCE(EXCLUDED.notes, shift_templates.notes),
          updated_at = now()
        RETURNING id INTO v_entity;

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
