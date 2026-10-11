-- ============================================================================
-- P0-RT HIGH batch: #49, #43, #38, #37, #44
-- ============================================================================

-- ---------------------------------------------------------------------------
-- #49 — destructive company DELETE cascades.
-- "owners delete own companies" lets an owner delete a company row whose
-- events → shifts → assignments → timesheets/invoices/payouts/IOUs all
-- cascade — wiping the crew's financial history with one DELETE.
-- A company that has produced any event can no longer be hard-deleted; only a
-- brand-new empty company is removable through the API.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_company_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM events WHERE company_id = OLD.id) THEN
    RAISE EXCEPTION 'A company with event history cannot be deleted through the API'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS companies_guard_delete ON companies;
CREATE TRIGGER companies_guard_delete BEFORE DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION guard_company_delete();

-- ---------------------------------------------------------------------------
-- #43 — live-shift terms editable after confirmation.
-- "shifts managed by company" is FOR ALL: once a worker is confirmed, the
-- company could still rewrite starts_at/ends_at/hourly_rate/certs — changing
-- the deal after the worker committed. Terms freeze once any confirmed
-- assignment exists; status/notes/broadcast fields stay editable, headcount
-- may grow but never drop below confirmed staffing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_shift_terms() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_confirmed integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_confirmed
    FROM shift_assignments
   WHERE shift_id = OLD.id AND status = 'confirmed';

  IF v_confirmed = 0 THEN RETURN NEW; END IF;

  IF NEW.starts_at           IS DISTINCT FROM OLD.starts_at
  OR NEW.ends_at             IS DISTINCT FROM OLD.ends_at
  OR NEW.hourly_rate         IS DISTINCT FROM OLD.hourly_rate
  OR NEW.role_name           IS DISTINCT FROM OLD.role_name
  OR NEW.skill_id            IS DISTINCT FROM OLD.skill_id
  OR NEW.min_proficiency     IS DISTINCT FROM OLD.min_proficiency
  OR NEW.required_cert_codes IS DISTINCT FROM OLD.required_cert_codes
  OR NEW.event_id            IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION 'Shift terms are locked once crew is confirmed (cancel and re-post instead)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.headcount < v_confirmed THEN
    RAISE EXCEPTION 'Headcount cannot drop below confirmed staffing'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shifts_guard_terms ON shifts;
CREATE TRIGGER shifts_guard_terms BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION guard_shift_terms();

-- ---------------------------------------------------------------------------
-- #38 — worker can self-flip application to 'accepted'.
-- "Workers can manage own applications" is FOR ALL, so an applicant can
-- UPDATE status = 'accepted' themselves. Workers may only create pending
-- applications, withdraw, and edit their pitch while pending; only the gig
-- owner can accept or reject.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workers can manage own applications" ON gig_applications;

CREATE POLICY "Workers create own applications" ON gig_applications FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = gig_applications.worker_id
                AND profiles.user_id = auth.uid())
  );

CREATE POLICY "Workers withdraw own applications" ON gig_applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = gig_applications.worker_id
                 AND profiles.user_id = auth.uid()));

CREATE POLICY "Companies respond to their gig applications" ON gig_applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM gigs JOIN profiles ON profiles.id = gigs.created_by
                 WHERE gigs.id = gig_applications.gig_id AND profiles.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION guard_gig_application_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_is_worker boolean;
  v_is_owner  boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.gig_id IS DISTINCT FROM OLD.gig_id OR NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    RAISE EXCEPTION 'Application gig and worker are immutable'
      USING ERRCODE = '42501';
  END IF;

  v_is_worker := EXISTS (SELECT 1 FROM profiles
                          WHERE profiles.id = OLD.worker_id AND profiles.user_id = auth.uid());
  v_is_owner  := EXISTS (SELECT 1 FROM gigs JOIN profiles ON profiles.id = gigs.created_by
                          WHERE gigs.id = OLD.gig_id AND profiles.user_id = auth.uid());

  IF v_is_owner THEN
    -- company decides: pending -> accepted | rejected
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected')) THEN
      RAISE EXCEPTION 'Company cannot move application from % to %', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
    IF NEW.cover_letter IS DISTINCT FROM OLD.cover_letter
       OR NEW.proposed_rate IS DISTINCT FROM OLD.proposed_rate THEN
      RAISE EXCEPTION 'Company cannot rewrite the application pitch'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_is_worker THEN
    -- worker may only withdraw, or tune the pitch while still pending
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'withdrawn') THEN
      RAISE EXCEPTION 'Worker cannot move application from % to %', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'pending'
       AND (NEW.cover_letter IS DISTINCT FROM OLD.cover_letter
         OR NEW.proposed_rate IS DISTINCT FROM OLD.proposed_rate) THEN
      RAISE EXCEPTION 'Application pitch is frozen once decided'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this application'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gig_applications_guard ON gig_applications;
CREATE TRIGGER gig_applications_guard BEFORE UPDATE ON gig_applications
  FOR EACH ROW EXECUTE FUNCTION guard_gig_application_update();

-- ---------------------------------------------------------------------------
-- #37 — self-reviews / review bombing.
-- The old INSERT policy only proved reviewer_id belonged to the caller:
-- self-reviews passed (reviewer = reviewee) and gig_id was nullable, so the
-- UNIQUE(gig_id, reviewer_id, reviewee_id) constraint never fired and one
-- account could spam unlimited reviews on a target. A review now requires a
-- real gig where both parties actually participated.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create reviews for completed gigs" ON reviews;
CREATE POLICY "Users can create reviews for completed gigs" ON reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id <> reviewee_id
    AND gig_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles
                WHERE profiles.id = reviewer_id AND profiles.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM gigs g
                WHERE g.id = gig_id
                  AND (g.created_by = reviewer_id
                    OR EXISTS (SELECT 1 FROM gig_applications a
                               WHERE a.gig_id = g.id AND a.worker_id = reviewer_id)))
    AND EXISTS (SELECT 1 FROM gigs g
                WHERE g.id = gig_id
                  AND (g.created_by = reviewee_id
                    OR EXISTS (SELECT 1 FROM gig_applications a
                               WHERE a.gig_id = g.id AND a.worker_id = reviewee_id)))
  );

-- reviews point at the shared gig only; nobody may retarget a review at a
-- different victim or rewrite who wrote it.
CREATE OR REPLACE FUNCTION guard_review_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
  OR NEW.reviewee_id IS DISTINCT FROM OLD.reviewee_id
  OR NEW.gig_id      IS DISTINCT FROM OLD.gig_id THEN
    RAISE EXCEPTION 'Review participants and gig are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reviews_guard_update ON reviews;
CREATE TRIGGER reviews_guard_update BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION guard_review_update();

-- ---------------------------------------------------------------------------
-- #44 — account enumeration via anon-callable lookup.
-- lookup_user_by_username_or_email() is a SECURITY DEFINER RPC granted to
-- anon that returns user_id + email for any email/username — an open oracle
-- for "does this email have an account". Nothing in the app calls it; the
-- anon and authenticated grants are revoked outright.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION lookup_user_by_username_or_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION lookup_user_by_username_or_email(text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- #38 follow-up — the calendar-sync trigger family runs SECURITY INVOKER, so
-- an accept/delete performed by the gig owner tried to write/delete rows in
-- the WORKER's calendar as the company and died on RLS. They were dormant
-- dead code until the owner-accept path existed. These are system writes:
-- mark them SECURITY DEFINER with a pinned search_path so the owner context
-- can't smuggle extra privileges in.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.create_calendar_event_from_application() SECURITY DEFINER;
ALTER FUNCTION public.create_calendar_event_from_application() SET search_path = public;
ALTER FUNCTION public.create_calendar_event_from_gig()          SECURITY DEFINER;
ALTER FUNCTION public.create_calendar_event_from_gig()          SET search_path = public;
ALTER FUNCTION public.update_calendar_event_from_gig()          SECURITY DEFINER;
ALTER FUNCTION public.update_calendar_event_from_gig()          SET search_path = public;
ALTER FUNCTION public.delete_calendar_event_from_gig()          SECURITY DEFINER;
ALTER FUNCTION public.delete_calendar_event_from_gig()          SET search_path = public;

-- #44 follow-up — Postgres grants EXECUTE on new functions to PUBLIC by
-- default, so revoking the named roles left the oracle open to anyone.
REVOKE EXECUTE ON FUNCTION lookup_user_by_username_or_email(text) FROM PUBLIC;
