-- Fan company-side notifications out to ALL company_members, not just
-- companies.created_by. With dual-role membership (20261203000000), a
-- company can have owner/admin/staff members and the creator may not be the
-- person working the ops queue — notifying only created_by strands alerts.
--
-- company_member_ids() is the shared resolver. It is deliberately NOT
-- executable by API roles: it returns membership for ANY company, so leaving
-- it callable would be a membership-enumeration oracle. Only the SECURITY
-- DEFINER functions below (and future notifiers) call it.

CREATE OR REPLACE FUNCTION public.company_member_ids(p_company_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT m.profile_id FROM public.company_members m WHERE m.company_id = p_company_id
$$;

REVOKE EXECUTE ON FUNCTION public.company_member_ids(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- auto_backfill_shift — "pool exhausted" warning went to created_by only.
-- Body identical to live except the owner lookup and the final notification.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_backfill_shift(p_shift_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift shifts%ROWTYPE;
  v_company uuid;
  v_gap integer;
  v_worker uuid;
  v_rate numeric;
  v_offered integer := 0;
  v_task uuid;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND
     OR v_shift.status NOT IN ('open', 'filled', 'in_progress')
     OR v_shift.ends_at <= now() THEN
    RETURN 0;
  END IF;

  SELECT e.company_id INTO v_company
  FROM events e WHERE e.id = v_shift.event_id;

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

    -- every member hears about the exhausted pool, not just the creator
    IF v_task IS NOT NULL AND v_company IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
      SELECT m.profile_id,
             'Backfill pool exhausted',
             v_shift.title || ' still needs ' || v_gap || ' crew — no eligible roster candidates left.',
             'warning', '/ops', jsonb_build_object('shift_id', p_shift_id, 'task_id', v_task)
      FROM public.company_member_ids(v_company) AS m(profile_id);
    END IF;
  END IF;

  RETURN v_offered;
END $function$;

-- ============================================================================
-- detect_no_shows — company alert targeted c.created_by; now all members.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_no_shows(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flagged integer := 0;
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT owns_company(p_company_id) THEN
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
  SELECT m.profile_id,
         'No-show: ' || s.title,
         p.full_name || ' never clocked in for ' || s.title || ' — backfill offer sent if the roster can cover.',
         'warning', '/events/' || e.id, jsonb_build_object('shift_id', f.shift_id, 'worker_id', f.worker_id)
  FROM flagged f
  JOIN shifts s ON s.id = f.shift_id
  JOIN events e ON e.id = s.event_id
  JOIN profiles p ON p.id = f.worker_id
  CROSS JOIN LATERAL public.company_member_ids(p_company_id) AS m(profile_id);

  GET DIAGNOSTICS v_flagged = ROW_COUNT;
  RETURN v_flagged;
END $function$;

-- ============================================================================
-- notify_on_application_status_change — legacy gigs trigger; the company-side
-- alert went to g.created_by. gigs.company_id exists, so fan out to that
-- company's members, keeping created_by as a fallback recipient so legacy
-- gigs with no company_id still notify the poster.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_application_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT
      p.id,
      CASE
        WHEN NEW.status = 'accepted' THEN 'Application Accepted! 🎉'
        WHEN NEW.status = 'rejected' THEN 'Application Update'
        ELSE 'Application Status Changed'
      END,
      CASE
        WHEN NEW.status = 'accepted' THEN 'Congratulations! Your application for "' || g.title || '" has been accepted.'
        WHEN NEW.status = 'rejected' THEN 'Your application for "' || g.title || '" was not selected this time.'
        ELSE 'Your application for "' || g.title || '" has been updated to ' || NEW.status || '.'
      END,
      CASE
        WHEN NEW.status = 'accepted' THEN 'success'
        WHEN NEW.status = 'rejected' THEN 'info'
        ELSE 'info'
      END,
      jsonb_build_object(
        'application_id', NEW.id,
        'gig_id', NEW.gig_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'gig_title', g.title
      )
    FROM profiles p
    JOIN gigs g ON g.id = NEW.gig_id
    WHERE p.id = NEW.worker_id;

    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT DISTINCT
      p.id,
      'Application Status Updated',
      'Application from ' || wp.full_name || ' for "' || g.title || '" is now ' || NEW.status || '.',
      'info',
      jsonb_build_object(
        'application_id', NEW.id,
        'gig_id', NEW.gig_id,
        'worker_id', NEW.worker_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'worker_name', wp.full_name
      )
    FROM gigs g
    JOIN profiles wp ON wp.id = NEW.worker_id
    JOIN profiles p ON p.id IN (
      SELECT g.created_by
      UNION
      SELECT m.profile_id FROM public.company_member_ids(g.company_id) AS m(profile_id)
      WHERE g.company_id IS NOT NULL
    )
    WHERE g.id = NEW.gig_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- open_timesheet_dispute — worker-dispute alert went to companies.created_by;
-- now every member sees it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_timesheet_dispute(p_timesheet_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ts timesheets%ROWTYPE;
  v_caller uuid := current_profile_id();
  v_company uuid;
BEGIN
  SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timesheet not found';
  END IF;
  -- Disputes are a pre-approval mediation only. Opening one on an approved
  -- sheet would let resolve→'submitted'→approve mint a second invoice and
  -- payout for the same work. Post-approval corrections need an adjustment
  -- flow, not a status rewind.
  IF v_ts.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted timesheets can be disputed (status: %)', v_ts.status;
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;

  SELECT e.company_id INTO v_company
  FROM shifts s JOIN events e ON e.id = s.event_id WHERE s.id = v_ts.shift_id;

  IF v_ts.worker_id = v_caller THEN
    INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
    SELECT m.profile_id, 'Timesheet disputed',
           'A worker disputed their timesheet: ' || p_reason,
           'warning', '/timesheets', jsonb_build_object('timesheet_id', v_ts.id)
    FROM public.company_member_ids(v_company) AS m(profile_id);
  ELSIF owns_company(v_company) THEN
    INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
    VALUES (v_ts.worker_id, 'Timesheet flagged',
            'Your timesheet was flagged for review: ' || p_reason,
            'warning', '/dashboard', jsonb_build_object('timesheet_id', v_ts.id));
  ELSE
    RAISE EXCEPTION 'Not a party to this timesheet';
  END IF;

  UPDATE timesheets SET
    status = 'disputed',
    dispute_opened_by = v_caller,
    dispute_reason = p_reason,
    resolution = NULL,
    resolved_by = NULL,
    resolved_at = NULL,
    updated_at = now()
  WHERE id = p_timesheet_id;
  RETURN true;
END $function$;

-- ============================================================================
-- sync_swap_claim — swap-pending company alert went to created_by; now all
-- members. company_owner variable removed; members are inserted directly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_swap_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  r swap_requests%ROWTYPE;
  new_assignment_id uuid;
  v_company uuid;
  shift_title text;
  requester_name text;
BEGIN
  SELECT * INTO r FROM swap_requests WHERE id = NEW.swap_request_id;

  IF OLD.status = 'pending' AND NEW.status = 'accepted' AND r.status = 'open' THEN
    SELECT s.title INTO shift_title FROM shifts s WHERE s.id = r.shift_id;
    SELECT p.full_name INTO requester_name FROM profiles p WHERE p.id = r.requester_worker_id;

    UPDATE swap_claims SET status = 'rejected'
    WHERE swap_request_id = r.id AND status = 'pending' AND id <> NEW.id;

    -- Revives a previously-terminal assignment row if one exists.
    INSERT INTO shift_assignments (shift_id, worker_id, status, source, offered_rate)
    SELECT r.shift_id, NEW.claimer_worker_id, 'offered', 'public_marketplace',
           coalesce((SELECT a.offered_rate FROM shift_assignments a WHERE a.id = r.assignment_id),
                    (SELECT s.hourly_rate FROM shifts s WHERE s.id = r.shift_id))
    ON CONFLICT (shift_id, worker_id)
    DO UPDATE SET status = 'offered', offered_rate = EXCLUDED.offered_rate
    RETURNING id INTO new_assignment_id;

    UPDATE swap_requests
    SET status = 'offered', accepted_claim_id = NEW.id, offered_assignment_id = new_assignment_id
    WHERE id = r.id;

    -- Company notification: every member sees the swap enter their offer flow.
    SELECT e.company_id INTO v_company
    FROM events e
    JOIN shifts s ON s.event_id = e.id
    WHERE s.id = r.shift_id;
    IF v_company IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, metadata)
      SELECT m.profile_id, 'Shift swap pending',
        coalesce(requester_name, 'A crew member') || ' wants to hand off "' || coalesce(shift_title, 'a shift') ||
        '" — a replacement offer is out for approval.',
        'swap', jsonb_build_object('swap_request_id', r.id, 'offered_assignment_id', new_assignment_id)
      FROM public.company_member_ids(v_company) AS m(profile_id);
    END IF;
  END IF;

  -- Unwinding an accepted claim pulls the offer back and re-opens the swap.
  IF OLD.status = 'accepted' AND NEW.status IN ('rejected', 'withdrawn') THEN
    UPDATE shift_assignments SET status = 'declined'
    WHERE id = r.offered_assignment_id AND status = 'offered';
    UPDATE swap_requests
    SET status = 'open', accepted_claim_id = NULL, offered_assignment_id = NULL
    WHERE id = r.id AND status = 'offered';
  END IF;

  RETURN NEW;
END $function$;
