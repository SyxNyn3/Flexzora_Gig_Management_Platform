-- Red-team batch 2: #106, #107, #108, #109, #110, #111, #112, #113, #114, #116.
--
-- #106 shift/event DELETE still cascades through bookings, timesheets and crew
--      rows. A delete-guard at each level: rows with live crew commitments can
--      only be cancelled, never deleted.
-- #107 pay repricing: overtime_rule_code (events) and platform_fee_pct
--      (event_budgets) stayed editable after crew confirmed — both feed
--      approve_timesheet. Same freeze rule as guard_shift_terms.
-- #108 send_broadcast: no row lock + notify before dedupe → double-tap and
--      replay both re-notify. Lock the broadcast row; only notify recipients
--      whose row actually lands.
-- #109 staff_members.profile_id trusted blindly → a company could push
--      broadcasts + ICS feeds to any profile. The link now has to match the
--      staff row's email (case-insensitive).
-- #110 roster_contacts import: per-row outcomes enumerate registered accounts.
--      The contact-sync shape is inherent, so bound it: cap roster_contacts
--      jobs at 500 rows and stop echoing the probed address in error text.
-- #111 commit_import_job check-then-update race → claim the job atomically.
-- #112 generate_unfilled_tasks concurrent sweeps duplicate cards → partial
--      unique index + ON CONFLICT.
-- #113 create_notification PUBLIC-executable definer → revoke; notifications
--      are system-written only.
-- #114 same PUBLIC-execute class: generate_shift_briefing revoked.
--      worker_meets_shift_certs stays granted — the swap cert-preview UI is
--      an intentional caller (explicit GRANT in shift_swap).
-- #116 runner rewrites price_cents on confirmed orders — the minted IOU never
--      re-syncs. Price is immutable once confirmed; a real correction is a
--      cancel + re-order (new ledger entry, visible trail).

-- ============================================================================
-- #106 — delete guards on shifts and events
-- ============================================================================

CREATE OR REPLACE FUNCTION guard_shift_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM shift_assignments
     WHERE shift_id = OLD.id AND status IN ('offered', 'confirmed')
  ) OR EXISTS (SELECT 1 FROM timesheets WHERE shift_id = OLD.id) THEN
    RAISE EXCEPTION 'This call has bookings or timesheets — cancel it, do not delete it'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_guard_delete ON shifts;
CREATE TRIGGER shifts_guard_delete BEFORE DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION guard_shift_delete();

CREATE OR REPLACE FUNCTION guard_event_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM shift_assignments a
    JOIN shifts s ON s.id = a.shift_id
     WHERE s.event_id = OLD.id AND a.status IN ('offered', 'confirmed')
  ) OR EXISTS (
    SELECT 1 FROM timesheets t
    JOIN shifts s ON s.id = t.shift_id
     WHERE s.event_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This event has bookings or timesheets — cancel it, do not delete it'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_guard_delete ON events;
CREATE TRIGGER events_guard_delete BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION guard_event_delete();

-- ============================================================================
-- #107 — freeze pay inputs once crew is committed
-- ============================================================================

CREATE OR REPLACE FUNCTION guard_event_terms_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.overtime_rule_code IS DISTINCT FROM OLD.overtime_rule_code
     AND EXISTS (
       SELECT 1 FROM shift_assignments a
       JOIN shifts s ON s.id = a.shift_id
        WHERE s.event_id = OLD.id AND a.status = 'confirmed'
     ) THEN
    RAISE EXCEPTION 'Overtime rules lock once crew is confirmed — pay terms cannot be repriced'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_guard_terms ON events;
CREATE TRIGGER events_guard_terms BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION guard_event_terms_update();

CREATE OR REPLACE FUNCTION guard_event_budgets_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.platform_fee_pct IS DISTINCT FROM OLD.platform_fee_pct
     AND EXISTS (
       SELECT 1 FROM shift_assignments a
       JOIN shifts s ON s.id = a.shift_id
        WHERE s.event_id = OLD.event_id AND a.status = 'confirmed'
     ) THEN
    RAISE EXCEPTION 'Platform fee locks once crew is confirmed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_budgets_guard_terms ON event_budgets;
CREATE TRIGGER event_budgets_guard_terms BEFORE UPDATE ON event_budgets
  FOR EACH ROW EXECUTE FUNCTION guard_event_budgets_update();

-- ============================================================================
-- #108 — atomic send + notify only rows that land
-- ============================================================================

CREATE OR REPLACE FUNCTION send_broadcast(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_b broadcasts%ROWTYPE;
  v_rec record;
  v_notif uuid;
  v_recipient_id uuid;
  v_sent int := 0;
  v_queued int := 0;
  v_staff_profile uuid;
BEGIN
  -- FOR UPDATE serializes concurrent sends: the loser sees status='sent'.
  SELECT * INTO v_b FROM broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast not found'; END IF;
  IF NOT owns_company(v_b.company_id) THEN RAISE EXCEPTION 'Not your broadcast'; END IF;
  IF v_b.status <> 'draft' THEN RAISE EXCEPTION 'Broadcast already sent'; END IF;
  UPDATE broadcasts SET status = 'sent', sent_at = now() WHERE id = v_b.id;

  FOR v_rec IN
    SELECT * FROM resolve_broadcast_audience(
      v_b.company_id, v_b.audience, v_b.event_id, v_b.shift_id, v_b.include_staff)
  LOOP
    IF v_rec.worker_id IS NOT NULL THEN
      -- dedupe first: only a recipient row that lands earns a notification
      INSERT INTO broadcast_recipients (broadcast_id, company_id, worker_id, channel, status)
      VALUES (v_b.id, v_b.company_id, v_rec.worker_id, 'in_app', 'sent')
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_recipient_id;
      IF v_recipient_id IS NOT NULL THEN
        v_notif := create_notification(
          v_rec.worker_id,
          COALESCE(NULLIF(v_b.subject, ''), 'Broadcast from your production'),
          v_b.body,
          'broadcast',
          '/dashboard',
          jsonb_build_object('broadcast_id', v_b.id)
        );
        UPDATE broadcast_recipients SET notification_id = v_notif WHERE id = v_recipient_id;
        v_sent := v_sent + 1;
      END IF;
    ELSE
      SELECT profile_id INTO v_staff_profile FROM staff_members WHERE id = v_rec.staff_id;
      IF v_staff_profile IS NOT NULL THEN
        INSERT INTO broadcast_recipients (broadcast_id, company_id, worker_id, channel, status)
        VALUES (v_b.id, v_b.company_id, v_staff_profile, 'in_app', 'sent')
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_recipient_id;
        IF v_recipient_id IS NOT NULL THEN
          v_notif := create_notification(
            v_staff_profile,
            COALESCE(NULLIF(v_b.subject, ''), 'Broadcast from your production'),
            v_b.body,
            'broadcast',
            '/dashboard',
            jsonb_build_object('broadcast_id', v_b.id)
          );
          UPDATE broadcast_recipients SET notification_id = v_notif WHERE id = v_recipient_id;
          v_sent := v_sent + 1;
        END IF;
      ELSE
        INSERT INTO broadcast_recipients (broadcast_id, company_id, staff_id, channel, status, error)
        VALUES (v_b.id, v_b.company_id, v_rec.staff_id, 'email', 'queued', 'email transport not wired yet')
        ON CONFLICT DO NOTHING;
        v_queued := v_queued + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sent', v_sent, 'queued', v_queued);
END;
$$;

-- ============================================================================
-- #109 — staff profile link must match the staff row's email
-- ============================================================================

CREATE OR REPLACE FUNCTION guard_staff_profile_link() RETURNS trigger AS $$
BEGIN
  IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.email IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles p
     WHERE p.id = NEW.profile_id AND lower(p.email) = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'Linked profile must be the account registered to this staff member''s email'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_members_guard_link ON staff_members;
CREATE TRIGGER staff_members_guard_link BEFORE INSERT OR UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION guard_staff_profile_link();

-- ============================================================================
-- #110 + #111 — import hardening: row cap, no address echo, atomic claim
-- ============================================================================

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

  -- #110: bound the existence oracle — bigger sheets get split, not bulk-probed
  IF v_job.target = 'roster_contacts'
     AND (SELECT count(*) FROM import_rows
           WHERE job_id = p_job_id AND status IN ('ready', 'warning')) > 500 THEN
    RAISE EXCEPTION 'Roster imports are capped at 500 rows — split the sheet';
  END IF;

  -- Shifts need a target event owned by the same company.
  IF v_job.target = 'shifts' THEN
    IF v_job.event_id IS NULL THEN RAISE EXCEPTION 'Pick an event to import calls into'; END IF;
    IF NOT owns_event(v_job.event_id) THEN RAISE EXCEPTION 'Not your event'; END IF;
    SELECT status <> 'draft' INTO v_live FROM events WHERE id = v_job.event_id;
  END IF;

  -- #111: claim atomically — one conditional UPDATE, not check-then-update
  UPDATE import_jobs SET status = 'committing', error = NULL
   WHERE id = p_job_id AND status NOT IN ('committing', 'cancelled');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job is already being committed';
  END IF;

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
          -- #110: no address echo — outcome stays imported/error, but the probed
          -- address is not parroted back into a stored record
          RAISE EXCEPTION 'No Flexzora worker account on that contact — invite them first (or import as staff)';
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

-- ============================================================================
-- #112 — one urgent card per shift
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ops_tasks_auto_unfilled_uq
  ON ops_tasks (shift_id, source)
  WHERE source = 'auto_unfilled' AND column_key <> 'done';

-- ============================================================================
-- #113 + #114 — definer functions are internal: revoke public execution
-- ============================================================================

REVOKE EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION generate_shift_briefing(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- #116 — verified already-fixed by 20261106000000_p0rt_grub_price_lock:
-- confirmed orders reject price/item changes, the IOU mints only on orderer
-- consent (price_accepted_at), and confirmed→cancelled voids the ledger row.
-- No change required; 098 asserts the lock still holds.
-- ============================================================================

