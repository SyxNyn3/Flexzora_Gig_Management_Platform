-- Dual-role company membership: a worker-profile account can create and run a
-- production company without mutating the immutable profiles.role.
--
-- Model: membership table, not role mutation.
--   * public.company_members (company_id, profile_id, member_role) is the
--     source of truth for "who operates this company".
--   * owns_company() is redefined to check membership, which upgrades every
--     RLS policy and SECURITY DEFINER helper that already routes through it
--     (~20 migrations of policies: events, shifts, broadcasts, rosters,
--     timesheets, escrow, compliance, copilot, ...).
--   * companies.created_by stays as "who created it" display/back-compat data
--     (immutable via guard_company_update) — it is no longer the access check.
--   * All API-facing company creation flows through create_company(), which
--     writes the company row AND the owner membership atomically. Direct
--     INSERT on companies is closed to authenticated roles.
--
-- member_role semantics in this phase:
--   owner/admin — full company control (owns_company-gated surfaces plus
--                 company row UPDATE/DELETE)
--   staff       — owns_company-gated operational surfaces (broadcasts,
--                 timesheet approval, roster, ...). Deliberately included in
--                 owns_company so a hired ops manager can work; money-moving
--                 edges (payout release, escrow funding) check owner/admin
--                 explicitly in their edge functions.
--
-- companies_guard_update trigger is unchanged: created_by still can't move.

-- ============================================================================
-- 1. company_members table + RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_members (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'staff'
    CHECK (member_role IN ('owner', 'admin', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_profile ON public.company_members(profile_id);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Read helper: the caller's role in a company, or NULL. SECURITY DEFINER so
-- the SELECT policy below can consult it without recursing into
-- company_members' own RLS.
CREATE OR REPLACE FUNCTION public.my_company_role(p_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT m.member_role
  FROM public.company_members m
  WHERE m.company_id = p_company_id
    AND m.profile_id = public.current_profile_id()
$$;

-- Members read their own rows; owners/admins read the full roster of any
-- company they administer. No INSERT/UPDATE/DELETE policies: membership
-- changes only happen inside SECURITY DEFINER RPCs (create_company today;
-- invite/role-management RPCs later).
CREATE POLICY "members read own membership" ON public.company_members
  FOR SELECT TO authenticated
  USING (
    profile_id = public.current_profile_id()
    OR public.my_company_role(company_id) IN ('owner', 'admin')
  );

-- Table-level privileges: authenticated keeps SELECT only. RLS would deny
-- writes anyway (no write policies), but revoking makes the intent explicit
-- and survives any future permissive policy added by mistake.
REVOKE INSERT, UPDATE, DELETE ON public.company_members FROM authenticated, anon;
GRANT SELECT ON public.company_members TO authenticated;

-- ============================================================================
-- 2. Backfill: every existing company creator becomes its owner member.
-- ============================================================================

INSERT INTO public.company_members (company_id, profile_id, member_role)
SELECT c.id, c.created_by, 'owner'
FROM public.companies c
WHERE c.created_by IS NOT NULL
ON CONFLICT DO NOTHING;

-- Safety net for every OTHER write path: service-role inserts (edge
-- functions, admin SQL, seeds, pgTAP fixtures) bypass the create_company RPC,
-- and without a member row the creator would lose all owns_company-gated
-- access the moment this migration lands. The trigger preserves the old
-- invariant "creator is owner" for non-API inserts; the RPC's own member
-- insert uses ON CONFLICT DO NOTHING so the two never collide.
CREATE OR REPLACE FUNCTION public.company_members_seed_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, profile_id, member_role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS companies_seed_owner_member ON public.companies;
CREATE TRIGGER companies_seed_owner_member AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.company_members_seed_owner();

-- ============================================================================
-- 3. owns_company → membership
-- ============================================================================
-- Every policy/function that calls owns_company now resolves through
-- company_members. member_role is intentionally NOT filtered here: 'staff'
-- members are trusted operators (see header). Money-moving paths check
-- owner/admin explicitly.

CREATE OR REPLACE FUNCTION public.owns_company(p_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = p_company_id
      AND m.profile_id = public.current_profile_id()
  )
$$;

-- ============================================================================
-- 4. create_company RPC — the ONLY API path that creates companies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_company(
  p_name text,
  p_contact_email text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_website_url text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_address text DEFAULT NULL
) RETURNS SETOF public.companies
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_profile_id uuid;
  v_profile_email text;
  v_name text := btrim(COALESCE(p_name, ''));
  v_company public.companies%ROWTYPE;
BEGIN
  -- auth.uid() required; resolves the caller's profile row.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for this account' USING ERRCODE = '42501';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Company name is required' USING ERRCODE = '22023';
  END IF;

  -- Cheap abuse cap: 10 memberships per profile. Only counts membership rows
  -- (a user could be staff somewhere AND own companies; the cap is on rows,
  -- which is what this table can see without scanning companies).
  IF (SELECT count(*) FROM public.company_members m WHERE m.profile_id = v_profile_id) >= 10 THEN
    RAISE EXCEPTION 'Company membership limit reached' USING ERRCODE = '42501';
  END IF;

  SELECT p.email INTO v_profile_email FROM public.profiles p WHERE p.id = v_profile_id;

  INSERT INTO public.companies (
    name, description, website_url, contact_email, contact_phone, address, created_by
  ) VALUES (
    v_name,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_website_url, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p_contact_email, '')), ''), v_profile_email),
    NULLIF(btrim(COALESCE(p_contact_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    v_profile_id
  )
  RETURNING * INTO v_company;

  -- The AFTER INSERT trigger also seeds this row; ON CONFLICT keeps the RPC
  -- correct even if the trigger is ever removed.
  INSERT INTO public.company_members (company_id, profile_id, member_role)
  VALUES (v_company.id, v_profile_id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN NEXT v_company;
  RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_company(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company(text, text, text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_company_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_company_role(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.company_members_seed_owner() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. my_company_memberships — the frontend's "which companies can I operate"
-- ============================================================================

CREATE OR REPLACE FUNCTION public.my_company_memberships()
RETURNS TABLE (company_id uuid, company_name text, member_role text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT m.company_id, c.name, m.member_role, m.created_at
  FROM public.company_members m
  JOIN public.companies c ON c.id = m.company_id
  WHERE m.profile_id = public.current_profile_id()
  ORDER BY c.name
$$;

REVOKE EXECUTE ON FUNCTION public.my_company_memberships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_company_memberships() TO authenticated;

-- ============================================================================
-- 6. companies policies: creation via RPC only; update/delete = owner/admin
-- ============================================================================

DROP POLICY IF EXISTS "company users create own companies" ON public.companies;
-- Direct INSERT is closed entirely: every creation path must go through
-- create_company() so the owner membership row is always written. (Definer
-- functions and service role bypass RLS as before.)
CREATE POLICY "companies created via rpc only" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "owners update own companies" ON public.companies;
CREATE POLICY "company admins update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.my_company_role(id) IN ('owner', 'admin'))
  WITH CHECK (public.my_company_role(id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "owners delete own companies" ON public.companies;
CREATE POLICY "company admins delete companies" ON public.companies
  FOR DELETE TO authenticated
  USING (public.my_company_role(id) IN ('owner', 'admin'));

-- SELECT policy ("Anyone can view companies") is unchanged: marketplace
-- browsing stays open to any authenticated user.

-- ============================================================================
-- 7. Inline created_by ownership checks → membership-aware
-- ============================================================================

-- approve_timesheet carried its own `companies.created_by = caller` check
-- instead of routing through owns_company. Body is identical to
-- 20261130000000_lows_batch.sql except that one check, which now resolves
-- through membership (staff included — approving timesheets is an ops task,
-- and the payout-release money gate lives in the release-payout edge fn).
CREATE OR REPLACE FUNCTION public.approve_timesheet(
  p_timesheet_id uuid,
  p_break_minutes integer DEFAULT NULL,
  p_payout_method text DEFAULT 'ach'
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_paid_in timestamptz;
  v_ts timesheets%ROWTYPE;
  v_assignment shift_assignments%ROWTYPE;
  v_shift shifts%ROWTYPE;
  v_event events%ROWTYPE;
  v_rule overtime_rules%ROWTYPE;
  v_caller uuid;
  v_rate numeric;
  v_fee_pct numeric;
  v_worked numeric;
  v_raw numeric;
  v_prior_weekly numeric;
  v_room numeric;
  v_reg numeric; v_ot numeric; v_dt numeric;
  v_meal_pen numeric := 0;
  v_turnaround numeric := 0;
  v_prior_end timestamptz;
  v_gap_hours numeric;
  v_gross numeric; v_fee numeric;
  v_iou record;
  v_iou_room integer;
  v_iou_cents integer := 0;
  v_take_cents integer;
  v_iou_lines jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_tr jsonb;
  v_iou_deduction numeric := 0;
  v_net numeric;
  v_remaining numeric;
  v_take numeric;
  v_invoice invoices%ROWTYPE;
  v_escrow escrow_deposits%ROWTYPE;
BEGIN
  SELECT id INTO v_caller FROM profiles WHERE user_id = auth.uid();
  SELECT * INTO v_ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF v_ts.id IS NULL THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF v_ts.status NOT IN ('submitted','disputed') THEN RAISE EXCEPTION 'Timesheet is % and cannot be approved', v_ts.status; END IF;
  IF v_ts.clock_in_at IS NULL OR v_ts.clock_out_at IS NULL THEN RAISE EXCEPTION 'Timesheet has no complete clock record'; END IF;

  SELECT * INTO v_assignment FROM shift_assignments WHERE id = v_ts.assignment_id;
  SELECT * INTO v_shift FROM shifts WHERE id = v_ts.shift_id;
  SELECT * INTO v_event FROM events WHERE id = v_shift.event_id;
  -- membership-aware: any company_members row (owner/admin/staff) may approve;
  -- owns_company resolves current_profile_id() == v_caller.
  IF NOT public.owns_company(v_event.company_id) THEN
    RAISE EXCEPTION 'Only the hiring company can approve this timesheet';
  END IF;
  SELECT * INTO v_rule FROM overtime_rules WHERE code = COALESCE(v_event.overtime_rule_code, 'US_FLSA');
  v_fee_pct := COALESCE((SELECT platform_fee_pct FROM event_budgets WHERE event_id = v_event.id), 12);

  -- negotiated direct-book rate wins over the posted call rate
  v_rate := COALESCE(v_assignment.offered_rate, v_shift.hourly_rate);

  -- #39: the 60-minute clock-in window is for early arrival, not early pay —
  -- paid time starts at call time unless the company approved the early start
  v_paid_in := CASE WHEN v_ts.early_start_approved THEN v_ts.clock_in_at
                    ELSE GREATEST(v_ts.clock_in_at, v_shift.starts_at) END;
  v_raw := extract(epoch FROM (v_ts.clock_out_at - v_paid_in)) / 3600.0
           - COALESCE(p_break_minutes, v_ts.break_minutes, 0) / 60.0;
  v_worked := GREATEST(v_raw, COALESCE(v_rule.minimum_call_hours, 0));

  -- daily split: regular / OT / DT
  v_dt := CASE WHEN v_rule.daily_dt_after_hours IS NOT NULL THEN GREATEST(v_worked - v_rule.daily_dt_after_hours, 0) ELSE 0 END;
  v_ot := CASE WHEN v_rule.daily_ot_after_hours IS NOT NULL THEN GREATEST(v_worked - v_dt - v_rule.daily_ot_after_hours, 0) ELSE 0 END;
  v_reg := v_worked - v_ot - v_dt;

  -- weekly threshold: hours worked EARLIER this ISO week consume the regular cap,
  -- so approval order cannot shift which shift's hours get the OT rate.
  IF v_rule.weekly_ot_after_hours IS NOT NULL THEN
    -- serialise approvals per worker+company so concurrent calls cannot both read the
    -- same prior total and each pay straight time past the cap
    PERFORM pg_advisory_xact_lock(hashtext('weekly_ot:' || v_ts.worker_id::text || ':' || v_event.company_id::text));
    -- worked hours of sheets clocked in earlier this week (approved ones have
    -- computed hour columns; pending ones are measured off their clock record)
    SELECT COALESCE(sum(COALESCE(
             t.regular_hours + t.overtime_hours + t.doubletime_hours,
             extract(epoch FROM (t.clock_out_at - t.clock_in_at)) / 3600.0 - COALESCE(t.break_minutes, 0) / 60.0
           )), 0) INTO v_prior_weekly
    FROM timesheets t
    JOIN shifts s ON s.id = t.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE t.worker_id = v_ts.worker_id
      AND t.id <> v_ts.id
      AND t.status IN ('submitted', 'approved', 'paid')
      AND e.company_id = v_event.company_id
      AND date_trunc('week', t.clock_in_at) = date_trunc('week', v_ts.clock_in_at)
      AND (t.clock_in_at, t.id) < (v_ts.clock_in_at, v_ts.id);
    v_room := GREATEST(v_rule.weekly_ot_after_hours - v_prior_weekly, 0);
    IF v_reg > v_room THEN
      v_ot := v_ot + (v_reg - v_room);
      v_reg := v_room;
    END IF;
  END IF;

  -- UNION PACK: meal penalty — worked past meal_penalty_after_hours without a
  -- real meal break (>= meal_break_min_minutes) → one extra hour at straight
  -- time (CA-style premium). The raw stretch triggers it, not the clamped call.
  IF v_rule.meal_penalty_after_hours IS NOT NULL
     AND v_raw > v_rule.meal_penalty_after_hours
     AND COALESCE(p_break_minutes, v_ts.break_minutes, 0) < v_rule.meal_break_min_minutes THEN
    v_meal_pen := 1;
  END IF;

  -- UNION PACK: turnaround — the company scheduled this call less than
  -- turnaround_min_hours after the worker's prior call with them ended.
  -- Hours worked before the rest floor completes bill at double time
  -- (the early hours are always regular hours, so they move reg→dt).
  IF v_rule.turnaround_min_hours IS NOT NULL THEN
    SELECT max(s.ends_at) INTO v_prior_end
    FROM shift_assignments a
    JOIN shifts s ON s.id = a.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE a.worker_id = v_ts.worker_id
      AND a.id <> v_ts.assignment_id
      AND a.status IN ('confirmed', 'completed')
      AND s.status <> 'cancelled' AND e.status <> 'cancelled'
      AND e.company_id = v_event.company_id
      AND s.ends_at <= v_ts.clock_in_at;
    IF v_prior_end IS NOT NULL THEN
      v_gap_hours := extract(epoch FROM (v_ts.clock_in_at - v_prior_end)) / 3600.0;
      IF v_gap_hours < v_rule.turnaround_min_hours THEN
        v_turnaround := LEAST(v_worked, v_rule.turnaround_min_hours - v_gap_hours);
        v_dt := v_dt + LEAST(v_reg, v_turnaround);
        v_reg := v_reg - LEAST(v_reg, v_turnaround);
      END IF;
    END IF;
  END IF;

  v_gross := round(v_reg * v_rate + v_ot * v_rate * v_rule.ot_multiplier + v_dt * v_rate * v_rule.dt_multiplier
                   + v_meal_pen * v_rate, 2);
  v_fee := round(v_gross * v_fee_pct / 100.0, 2);

  -- === IOU settlement (partial, #28) + beneficiary transfer =================
  -- Committed payout-deduction IOUs settle out of the payout, oldest first,
  -- capped at 25% of gross. Each collection ALSO queues an iou_transfer payout
  -- to the beneficiary — the deducted cents leave escrow to the person owed
  -- instead of pooling there. Order: this shift's IOUs, then carry-overs.
  v_iou_room := round(v_gross * 25);          -- gross dollars -> cap cents
  FOR v_iou IN
    SELECT i.*, (i.shift_id IS DISTINCT FROM v_shift.id) AS is_carry
    FROM crew_iou i
    LEFT JOIN shifts s ON s.id = i.shift_id
    WHERE i.worker_id = v_ts.worker_id
      AND i.status = 'committed' AND i.settle_via = 'payout_deduction'
      AND i.settled_cents < i.amount_cents
      AND (i.shift_id = v_shift.id
           OR (i.shift_id IS NOT NULL AND s.ends_at < now() AND s.status <> 'cancelled'))
    ORDER BY (i.shift_id IS DISTINCT FROM v_shift.id), i.created_at, i.id
    FOR UPDATE OF i
  LOOP
    EXIT WHEN v_iou_room <= 0;
    v_take_cents := LEAST(v_iou.amount_cents - v_iou.settled_cents, v_iou_room);
    CONTINUE WHEN v_take_cents <= 0;

    INSERT INTO crew_iou_settlements (iou_id, timesheet_id, amount_cents, carried_over)
    VALUES (v_iou.id, v_ts.id, v_take_cents, v_iou.is_carry);

    UPDATE crew_iou
       SET settled_cents = settled_cents + v_take_cents,
           status = CASE WHEN settled_cents + v_take_cents >= amount_cents THEN 'settled'::crew_iou_status ELSE status END,
           settled_at = CASE WHEN settled_cents + v_take_cents >= amount_cents THEN now() ELSE settled_at END,
           settled_timesheet_id = CASE WHEN settled_cents + v_take_cents >= amount_cents THEN v_ts.id ELSE settled_timesheet_id END,
           updated_at = now()
     WHERE id = v_iou.id;

    v_iou_lines := v_iou_lines || jsonb_build_object(
      'description',
        'Crew share: ' || v_iou.kind::text
        || COALESCE(' — ' || NULLIF(v_iou.notes, ''), '')
        || CASE WHEN v_iou.settled_cents + v_take_cents < v_iou.amount_cents
                THEN format(' (partial: %s of %s)', to_char(v_take_cents / 100.0, 'FM999999990.00'), to_char(v_iou.amount_cents / 100.0, 'FM999999990.00'))
                WHEN v_iou.settled_cents > 0
                THEN format(' (final %s of %s)', to_char(v_take_cents / 100.0, 'FM999999990.00'), to_char(v_iou.amount_cents / 100.0, 'FM999999990.00'))
                ELSE '' END
        || CASE WHEN v_iou.is_carry THEN ' (carried from earlier call)' ELSE '' END,
      'hours', NULL, 'rate', NULL,
      'amount', -(v_take_cents / 100.0),
      'iou_id', v_iou.id);

    -- only a worker beneficiary can receive a Connect transfer; legacy
    -- free-text `beneficiary` IOUs still settle (their cents stay in escrow
    -- as before this feature existed)
    IF v_iou.beneficiary_worker_id IS NOT NULL THEN
      v_transfers := v_transfers || jsonb_build_object(
        'iou', v_iou.id, 'beneficiary', v_iou.beneficiary_worker_id, 'cents', v_take_cents);
    END IF;

    v_iou_room := v_iou_room - v_take_cents;
    v_iou_cents := v_iou_cents + v_take_cents;
  END LOOP;
  v_iou_deduction := v_iou_cents / 100.0;
  v_net := v_gross - v_iou_deduction;
  -- ==========================================================================

  -- the worker nets net; the deductions fund their transfer payouts — the whole
  -- gross leaves escrow between them
  v_remaining := v_gross;
  FOR v_escrow IN
    SELECT * FROM escrow_deposits
    WHERE event_id = v_event.id AND status IN ('funded', 'partially_released')
    ORDER BY created_at FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_escrow.amount - v_escrow.released_amount, v_remaining);
    IF v_take > 0 THEN
      UPDATE escrow_deposits SET
        released_amount = released_amount + v_take,
        status = CASE WHEN released_amount + v_take >= amount THEN 'released'::escrow_status ELSE 'partially_released'::escrow_status END
      WHERE id = v_escrow.id;
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Escrow is short by $%: fund the event escrow before approving', to_char(v_remaining, 'FM999999990.00');
  END IF;

  UPDATE timesheets SET
    break_minutes = COALESCE(p_break_minutes, break_minutes),
    regular_hours = round(v_reg, 2), overtime_hours = round(v_ot, 2), doubletime_hours = round(v_dt, 2),
    meal_penalty_hours = v_meal_pen, turnaround_penalty_hours = v_turnaround,
    gross_pay = v_gross, status = 'approved', approved_by = v_caller, approved_at = now()
  WHERE id = v_ts.id;

  UPDATE shift_assignments SET status = 'completed' WHERE id = v_ts.assignment_id;

  -- the call is done once it has ended and nobody is still booked on it
  UPDATE shifts SET status = 'completed'
  WHERE id = v_shift.id AND ends_at < now() AND status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = v_shift.id AND a.status = 'confirmed');

  INSERT INTO invoices (timesheet_id, worker_id, company_id, event_id, line_items, subtotal, platform_fee, total)
  VALUES (
    v_ts.id, v_ts.worker_id, v_event.company_id, v_event.id,
    jsonb_build_array(
      jsonb_build_object('description', v_shift.role_name || ' – ' || v_shift.title || ' (regular)', 'hours', round(v_reg,2), 'rate', v_rate, 'amount', round(v_reg * v_rate, 2)),
      jsonb_build_object('description', 'Overtime x' || v_rule.ot_multiplier, 'hours', round(v_ot,2), 'rate', v_rate * v_rule.ot_multiplier, 'amount', round(v_ot * v_rate * v_rule.ot_multiplier, 2)),
      jsonb_build_object('description', 'Double time x' || v_rule.dt_multiplier, 'hours', round(v_dt,2), 'rate', v_rate * v_rule.dt_multiplier, 'amount', round(v_dt * v_rate * v_rule.dt_multiplier, 2))
    )
    || CASE WHEN v_meal_pen > 0 THEN jsonb_build_array(jsonb_build_object(
         'description', 'Meal penalty (no ' || v_rule.meal_break_min_minutes || 'min break in ' || v_rule.meal_penalty_after_hours || 'h)',
         'hours', v_meal_pen, 'rate', v_rate, 'amount', round(v_meal_pen * v_rate, 2))) ELSE '[]'::jsonb END
    || CASE WHEN v_turnaround > 0 THEN jsonb_build_array(jsonb_build_object(
         'description', 'Turnaround premium — ' || v_turnaround || 'h before the ' || v_rule.turnaround_min_hours || 'h rest floor bills as double time',
         'hours', v_turnaround, 'rate', NULL, 'amount', 0)) ELSE '[]'::jsonb END
    || v_iou_lines,
    v_gross, v_fee, v_net
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_net, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  -- transfer payouts: the deducted cents queue for the beneficiaries' Connect
  -- accounts through the same release flow
  FOR v_tr IN SELECT * FROM jsonb_array_elements(v_transfers) LOOP
    INSERT INTO payouts (invoice_id, worker_id, amount, kind, crew_iou_id, method, expected_arrival_at)
    VALUES (v_invoice.id, (v_tr ->> 'beneficiary')::uuid, (v_tr ->> 'cents')::int / 100.0,
            'iou_transfer', (v_tr ->> 'iou')::uuid, 'ach', now() + interval '2 days');
  END LOOP;

  RETURN v_invoice;
END $$;

GRANT EXECUTE ON FUNCTION public.approve_timesheet(uuid, integer, text) TO authenticated;

-- "companies see blocked availability" (latest def in
-- 20261001000000_worker_privacy_and_rls_fixes.sql) keyed off
-- companies.created_by — membership-aware now via owns_company.
DROP POLICY IF EXISTS "companies see blocked availability" ON public.availability;
CREATE POLICY "companies see blocked availability" ON public.availability FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR (is_available = false AND (
       EXISTS (SELECT 1 FROM preferred_rosters r
               JOIN companies c ON c.id = r.company_id
               WHERE r.worker_id = availability.worker_id AND public.owns_company(c.id))
       OR EXISTS (SELECT 1 FROM shift_assignments a
                  JOIN shifts s ON s.id = a.shift_id
                  JOIN events e ON e.id = s.event_id
                  WHERE a.worker_id = availability.worker_id AND public.owns_company(e.company_id)))));
