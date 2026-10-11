-- Lane B #1: cert verification workflow.
--
-- `verified` was already guarded (platform-review only, substance edits bounce
-- it back to unverified) — but the review path itself didn't exist, so nothing
-- could ever get verified. This adds the workflow: worker attaches a document
-- (private `cert-docs` bucket) and submits for review; any company the worker
-- is related to (roster / assignment / gig application) gets a review queue;
-- approve stamps verified+verified_at, reject sends it back with a note.
-- Pending reviews past 48h surface in the alerts inbox (`cert_review` kind).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS document_path text;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS document_name text;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none';
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id);
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS review_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_verification_status_check'
  ) THEN
    ALTER TABLE certifications ADD CONSTRAINT certifications_verification_status_check
      CHECK (verification_status IN ('none', 'pending', 'verified', 'rejected'));
  END IF;
END $$;

-- Backfill: already-verified rows reflect the new status field.
UPDATE certifications SET verification_status = 'verified'
  WHERE verified AND verification_status = 'none';

CREATE INDEX IF NOT EXISTS certifications_review_queue_idx
  ON certifications (verification_status) WHERE verification_status = 'pending';

-- ---------------------------------------------------------------------------
-- Guard: workers submit for review; only the definer review path can stamp.
-- Replaces the existing guard (kept identical rules plus the new columns).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_certification_verification() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.verified_at := NULL;
    NEW.verification_status := 'none';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
  ELSE
    -- Review outcome fields are written by review_certification only.
    IF NEW.verified IS DISTINCT FROM OLD.verified
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
      RAISE EXCEPTION 'Credential verification is set by platform review';
    END IF;
    -- Status may only move submit-side: none/rejected -> pending (resubmit).
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      IF NOT (NEW.verification_status = 'pending'
              AND OLD.verification_status IN ('none', 'rejected')) THEN
        RAISE EXCEPTION 'verification_status changes only through submit/review';
      END IF;
      NEW.verification_requested_at := now();
    END IF;
    -- Document swaps are allowed until verified (resubmit after rejection).
    IF NEW.document_path IS DISTINCT FROM OLD.document_path
       AND OLD.verification_status = 'verified' THEN
      RAISE EXCEPTION 'document is locked on a verified credential';
    END IF;
    -- Editing the substance of a verified credential sends it back for review.
    IF OLD.verified AND (
          NEW.name IS DISTINCT FROM OLD.name
       OR NEW.cert_type_code IS DISTINCT FROM OLD.cert_type_code
       OR NEW.issuing_organization IS DISTINCT FROM OLD.issuing_organization
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.credential_id IS DISTINCT FROM OLD.credential_id
       OR NEW.credential_url IS DISTINCT FROM OLD.credential_url) THEN
      NEW.verified := false;
      NEW.verified_at := NULL;
      NEW.verification_status := 'none';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Who may review: companies the worker is related to (roster, booking, or
-- legacy gig application). Shared by the queue RPC and the storage policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION worker_related_to_company(p_worker_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM preferred_rosters pr
    WHERE pr.company_id = p_company_id AND pr.worker_id = p_worker_id AND pr.tier <> 'blocked'
  ) OR EXISTS (
    SELECT 1 FROM shift_assignments sa
    JOIN shifts s ON s.id = sa.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE e.company_id = p_company_id AND sa.worker_id = p_worker_id
      AND sa.status IN ('offered', 'applied', 'confirmed', 'completed')
  ) OR EXISTS (
    SELECT 1 FROM gig_applications ga
    JOIN gigs g ON g.id = ga.gig_id
    WHERE g.company_id = p_company_id AND ga.worker_id = p_worker_id
      AND ga.status IN ('accepted')
  );
$$;

-- ---------------------------------------------------------------------------
-- Review queue: pending certs on workers related to the caller's company.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pending_cert_reviews(p_company_id uuid)
RETURNS SETOF certifications
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;
  RETURN QUERY
    SELECT c.* FROM certifications c
    WHERE c.verification_status = 'pending'
      AND worker_related_to_company(c.worker_id, p_company_id)
    ORDER BY c.verification_requested_at NULLS LAST;
END $$;
GRANT EXECUTE ON FUNCTION pending_cert_reviews(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION worker_related_to_company(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- review_certification: approve/reject. Reviewer must own a company related
-- to the worker. Notification lands in the worker's inbox either way.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION review_certification(
  p_cert_id uuid, p_company_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_cert certifications%ROWTYPE;
  v_reviewer uuid := current_profile_id();
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;
  SELECT * INTO v_cert FROM certifications WHERE id = p_cert_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certification not found';
  END IF;
  IF v_cert.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'credential is not awaiting review (status: %)', v_cert.verification_status;
  END IF;
  IF NOT worker_related_to_company(v_cert.worker_id, p_company_id) THEN
    RAISE EXCEPTION 'worker is not related to this company';
  END IF;
  IF NOT p_approve AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'a note is required when rejecting';
  END IF;

  UPDATE certifications SET
    verification_status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
    verified = p_approve,
    verified_at = CASE WHEN p_approve THEN now() ELSE NULL END,
    reviewed_by = v_reviewer,
    reviewed_at = now(),
    review_note = p_note
  WHERE id = p_cert_id;

  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  VALUES (
    v_cert.worker_id,
    CASE WHEN p_approve THEN 'Credential verified' ELSE 'Credential needs attention' END,
    CASE WHEN p_approve
      THEN format('%s was verified — it now counts toward gated calls.', v_cert.name)
      ELSE format('%s was rejected: %s', v_cert.name, p_note)
    END,
    CASE WHEN p_approve THEN 'success' ELSE 'warning' END,
    '/profile',
    jsonb_build_object('cert_id', v_cert.id, 'company_id', p_company_id, 'approved', p_approve)
  );
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION review_certification(uuid, uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private `cert-docs` bucket. Workers write their own folder
-- (<profile_id>/<cert_id>/<file>); related companies can read to review.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cert-docs', 'cert-docs', false, 10485760,
        '{image/jpeg,image/png,image/webp,application/pdf}')
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cert docs worker write" ON storage.objects;
CREATE POLICY "cert docs worker write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cert-docs'
              AND (storage.foldername(name))[1] = current_profile_id()::text);

DROP POLICY IF EXISTS "cert docs owner delete" ON storage.objects;
CREATE POLICY "cert docs owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cert-docs'
         AND (storage.foldername(name))[1] = current_profile_id()::text);

DROP POLICY IF EXISTS "cert docs review read" ON storage.objects;
CREATE POLICY "cert docs review read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cert-docs'
         AND (
           (storage.foldername(name))[1] = current_profile_id()::text
           OR EXISTS (
             SELECT 1 FROM companies co
             WHERE owns_company(co.id)
               AND worker_related_to_company((storage.foldername(name))[1]::uuid, co.id)
           )
         ));

-- ---------------------------------------------------------------------------
-- Alerts: pending reviews older than 48h nag the inbox; queue-clear resolves.
-- ---------------------------------------------------------------------------
ALTER TABLE company_alerts DROP CONSTRAINT IF EXISTS company_alerts_kind_check;
ALTER TABLE company_alerts ADD CONSTRAINT company_alerts_kind_check
  CHECK (kind IN ('unfilled_call', 'cert_expiring', 'timesheet_pending',
                  'shift_tomorrow', 'cert_review'));

CREATE OR REPLACE FUNCTION generate_company_alerts(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_opened int := 0;
  v_resolved int := 0;
  v_row record;
  v_pending int;
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT owns_company(p_company_id) THEN
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
      OR (a.kind = 'cert_review' AND NOT EXISTS (
        SELECT 1 FROM certifications c
        WHERE c.verification_status = 'pending'
          AND c.verification_requested_at <= now() - interval '48 hours'
          AND worker_related_to_company(c.worker_id, p_company_id)))
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

  -- ----- Open: cert reviews sitting in the queue >48h. ----------------------
  SELECT count(*) INTO v_pending
  FROM certifications c
  WHERE c.verification_status = 'pending'
    AND c.verification_requested_at <= now() - interval '48 hours'
    AND worker_related_to_company(c.worker_id, p_company_id);
  IF v_pending > 0 THEN
    INSERT INTO company_alerts (company_id, kind, severity, title, body,
                                dedupe_key, due_at)
    VALUES (
      p_company_id, 'cert_review', 'warning',
      format('%s credential%s waiting for review', v_pending,
             CASE WHEN v_pending = 1 THEN '' ELSE 's' END),
      'Booked or rostered crew submitted documents — verify so gated calls can book them.',
      'certreview:queue',
      now() + interval '24 hours')
    ON CONFLICT (company_id, dedupe_key) DO UPDATE
      SET title = EXCLUDED.title, updated_at = now(),
          status = 'open', resolved_at = NULL
      WHERE company_alerts.status <> 'dismissed';
    IF found THEN v_opened := v_opened + 1; END IF;
  END IF;

  RETURN jsonb_build_object('opened', v_opened, 'resolved', v_resolved);
END $$;
