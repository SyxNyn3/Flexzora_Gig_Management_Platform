-- Worker ledger core + per-company start-pack checklist.
--
-- Design (see docs/research/crew-worker-tools-landscape.md):
-- * The ledger is WORKER-OWNED and employer-agnostic. It aggregates the
--   worker's whole career — platform work (timesheets/invoices/expenses)
--   plus off-platform gigs entered manually. Companies get read access to
--   entries tagged with their company_id for reconciliation; entries are
--   worker-reported claims, not verified truth.
-- * We never custody money and never collect SSNs here. The start-pack
--   checklist TRACKS document status per production; actual sensitive
--   files stay in compliance_docs behind the existing review flow.

-- ---------------------------------------------------------------------------
-- 1) Expand compliance_docs.doc_type so start-pack documents (W-4, deal memo,
--    state forms, COI, union card, direct-deposit auth, NDA, safety certs)
--    can live in the same vault with the same review gate.
-- ---------------------------------------------------------------------------
ALTER TABLE compliance_docs DROP CONSTRAINT IF EXISTS compliance_docs_doc_type_check;
ALTER TABLE compliance_docs ADD CONSTRAINT compliance_docs_doc_type_check
  CHECK (doc_type IN (
    'w9', 'i9', 'w4', 'deal_memo', 'state_form', 'coi',
    'direct_deposit', 'union_card', 'nda', 'safety_cert', 'other'
  ));

-- ---------------------------------------------------------------------------
-- 2) worker_ledger_entries — manual ledger lines for anything the platform
--    tables don't already capture: mileage, per diem, off-platform income,
--    payments received outside Flexzora, adjustments.
--
--    Platform-covered data (timesheets, invoices, expenses) is NOT duplicated
--    here — ledger_summary() unions it at read time. Entries may reference a
--    shift_assignment when the work happened on-platform.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'mileage', 'per_diem', 'manual_income',
    'payment_received', 'expense_extra', 'adjustment'
  )),
  -- Signed cents: income/payment positive, expense_extra/adjustment may be
  -- negative when correcting. mileage/per_diem/manual_income must be > 0
  -- (enforced in the RPC, not here, so voided corrections stay possible).
  amount_cents integer NOT NULL,
  entry_date date NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES shift_assignments(id) ON DELETE SET NULL,
  -- Kind-specific payload: mileage {miles, rate_cents, odometer_start,
  -- odometer_end}, per_diem {nights, gsa_rate_cents, locality},
  -- manual_income {payer, invoice_ref}, payment_received {method, reference}.
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  -- Private-bucket object path for a receipt photo; never a public URL.
  receipt_path text,
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'billed', 'paid', 'void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_ledger_entries_worker_idx
  ON worker_ledger_entries (worker_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS worker_ledger_entries_company_idx
  ON worker_ledger_entries (company_id) WHERE company_id IS NOT NULL;

ALTER TABLE worker_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Workers own their ledger outright.
DROP POLICY IF EXISTS "workers manage own ledger entries" ON worker_ledger_entries;
CREATE POLICY "workers manage own ledger entries" ON worker_ledger_entries
  FOR ALL TO authenticated
  USING (worker_id = current_profile_id())
  WITH CHECK (worker_id = current_profile_id());

-- A company may READ entries it is owed against (worker-reported claims).
-- No write path: companies never edit a worker's ledger.
DROP POLICY IF EXISTS "companies read ledger entries tagged to them" ON worker_ledger_entries;
CREATE POLICY "companies read ledger entries tagged to them" ON worker_ledger_entries
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND owns_company(company_id));

-- ---------------------------------------------------------------------------
-- 3) gig_onboarding — the start-pack checklist, one row per worker+company.
--
--    items jsonb maps a stable item key to a state:
--      missing    -> nothing submitted yet
--      submitted  -> worker says they sent it / it's on file worker-side
--      confirmed  -> company verified it
--      waived     -> company explicitly waived the requirement
--
--    Transitions are role-gated by guard_onboarding_item(): workers may only
--    move items to 'submitted'/'missing'; company owner/admin may move them
--    to 'confirmed'/'waived'. Staff cannot change states (read-only).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gig_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, company_id)
);

CREATE INDEX IF NOT EXISTS gig_onboarding_worker_idx ON gig_onboarding (worker_id);
CREATE INDEX IF NOT EXISTS gig_onboarding_company_idx ON gig_onboarding (company_id);

ALTER TABLE gig_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers read own onboarding" ON gig_onboarding;
CREATE POLICY "workers read own onboarding" ON gig_onboarding
  FOR SELECT TO authenticated USING (worker_id = current_profile_id());

DROP POLICY IF EXISTS "company members read onboarding" ON gig_onboarding;
CREATE POLICY "company members read onboarding" ON gig_onboarding
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = gig_onboarding.company_id
      AND cm.profile_id = current_profile_id()
  ));

DROP POLICY IF EXISTS "workers insert own onboarding" ON gig_onboarding;
CREATE POLICY "workers insert own onboarding" ON gig_onboarding
  FOR INSERT TO authenticated WITH CHECK (worker_id = current_profile_id());

-- Direct UPDATE is allowed by RLS for both sides, but the trigger below
-- restricts WHICH state transitions each side may make.
DROP POLICY IF EXISTS "workers update own onboarding" ON gig_onboarding;
CREATE POLICY "workers update own onboarding" ON gig_onboarding
  FOR UPDATE TO authenticated
  USING (worker_id = current_profile_id())
  WITH CHECK (worker_id = current_profile_id());

DROP POLICY IF EXISTS "company admins update onboarding" ON gig_onboarding;
CREATE POLICY "company admins update onboarding" ON gig_onboarding
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = gig_onboarding.company_id
      AND cm.profile_id = current_profile_id()
      AND cm.member_role IN ('owner', 'admin')
  ))
  WITH CHECK (true);

-- State-transition guard. Item keys are validated here so a client can't
-- smuggle arbitrary jsonb keys; states are validated against the enum above.
CREATE OR REPLACE FUNCTION guard_onboarding_items() RETURNS trigger AS $$
DECLARE
  k text;
  v jsonb;
  item_state text;
  is_worker boolean;
  is_company_admin boolean;
  allowed_worker text[] := ARRAY['missing', 'submitted'];
  allowed_company text[] := ARRAY['confirmed', 'waived'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  -- Whole-row inserts may only carry an empty or all-'missing' checklist;
  -- richer states must come through onboarding_update_item.
  IF TG_OP = 'INSERT' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(NEW.items) LOOP
      item_state := v #>> '{}';
      IF item_state <> 'missing' THEN
        RAISE EXCEPTION 'Onboarding items start as missing — use onboarding_update_item';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- On UPDATE: worker side may only set worker-allowed states, company
  -- owner/admin may only set company-allowed states. Anything else is a
  -- no-op rejection (silently keeping OLD) so both sides' edits coexist.
  is_worker := (NEW.worker_id = current_profile_id());
  SELECT EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = NEW.company_id
      AND cm.profile_id = current_profile_id()
      AND cm.member_role IN ('owner', 'admin')
  ) INTO is_company_admin;

  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.items) LOOP
    item_state := v #>> '{}';
    -- Keys must come from the standard checklist — direct table writes
    -- can't invent items (RPCs are the intended path anyway).
    IF NOT (k = ANY(onboarding_item_keys())) THEN
      RAISE EXCEPTION 'Unknown onboarding item: %', k;
    END IF;
    IF item_state IS NULL OR item_state NOT IN ('missing','submitted','confirmed','waived') THEN
      RAISE EXCEPTION 'Invalid onboarding item state: %', item_state;
    END IF;
    IF is_worker AND NOT (item_state = ANY(allowed_worker)) THEN
      NEW.items := jsonb_set(NEW.items, ARRAY[k], to_jsonb(OLD.items ->> k));
    ELSIF is_company_admin AND NOT (item_state = ANY(allowed_company)) THEN
      NEW.items := jsonb_set(NEW.items, ARRAY[k], to_jsonb(OLD.items ->> k));
    ELSIF NOT is_worker AND NOT is_company_admin THEN
      RAISE EXCEPTION 'Not a party to this onboarding';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS gig_onboarding_guard ON gig_onboarding;
CREATE TRIGGER gig_onboarding_guard
  BEFORE INSERT OR UPDATE ON gig_onboarding
  FOR EACH ROW EXECUTE FUNCTION guard_onboarding_items();

-- ---------------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------------

-- Add a manual ledger entry. Worker is always auth.uid()'s profile — clients
-- cannot write for someone else. Kind rules: income kinds must be positive;
-- expense_extra/adjustment may be negative (corrections).
CREATE OR REPLACE FUNCTION ledger_add_entry(
  p_kind text,
  p_amount_cents integer,
  p_entry_date date,
  p_company_id uuid DEFAULT NULL,
  p_assignment_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_description text DEFAULT NULL,
  p_receipt_path text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_worker uuid := current_profile_id();
  v_id uuid;
BEGIN
  IF v_worker IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_kind NOT IN ('mileage','per_diem','manual_income',
                    'payment_received','expense_extra','adjustment') THEN
    RAISE EXCEPTION 'Invalid ledger kind: %', p_kind;
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    RAISE EXCEPTION 'Amount must be non-zero';
  END IF;
  IF p_kind IN ('mileage','per_diem','manual_income','payment_received')
     AND p_amount_cents < 0 THEN
    RAISE EXCEPTION 'Income-side entries must be positive; use adjustment to correct';
  END IF;
  IF p_entry_date IS NULL OR p_entry_date > current_date + 1 THEN
    RAISE EXCEPTION 'Entry date must be today or earlier';
  END IF;
  IF p_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM companies WHERE id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Unknown company';
  END IF;

  INSERT INTO worker_ledger_entries
    (worker_id, kind, amount_cents, entry_date, company_id,
     assignment_id, details, description, receipt_path)
  VALUES
    (v_worker, p_kind, p_amount_cents, p_entry_date, p_company_id,
     p_assignment_id, COALESCE(p_details, '{}'::jsonb), p_description,
     p_receipt_path)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ledger_add_entry(text, integer, date, uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger_add_entry(text, integer, date, uuid, uuid, jsonb, text, text) TO authenticated;

-- List manual ledger entries, newest first.
CREATE OR REPLACE FUNCTION ledger_entries(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
) RETURNS SETOF worker_ledger_entries LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
  SELECT * FROM worker_ledger_entries
  WHERE worker_id = current_profile_id()
    AND (p_from IS NULL OR entry_date >= p_from)
    AND (p_to IS NULL OR entry_date <= p_to)
    AND (p_company_id IS NULL OR company_id = p_company_id)
  ORDER BY entry_date DESC, created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

REVOKE EXECUTE ON FUNCTION ledger_entries(date, date, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger_entries(date, date, uuid, integer) TO authenticated;

-- The "who owes me" engine. For a tax year, per company:
--   earned    = approved timesheet gross + manual_income entries
--   billed    = non-void invoices issued
--   received  = paid invoices + payment_received entries
--   owed      = billed + manual income - received (platform side)
--   plus expense/mileage/per-diem totals from both platform expenses and
--   manual ledger entries.
CREATE OR REPLACE FUNCTION ledger_summary(
  p_year integer DEFAULT EXTRACT(YEAR FROM now())::integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_worker uuid := current_profile_id();
  v_result jsonb;
BEGIN
  IF v_worker IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Platform tables store dollars (numeric); worker_ledger_entries stores
  -- cents (integer). Convert platform sums to cents with ROUND(x*100).
  WITH ts AS (
    SELECT COALESCE(ROUND(SUM(gross_pay) * 100), 0)::bigint AS cents
    FROM timesheets
    WHERE worker_id = v_worker AND status = 'approved'
      AND EXTRACT(YEAR FROM approved_at) = p_year
  ),
  inv AS (
    SELECT
      COALESCE(ROUND(SUM(total) FILTER (WHERE paid_at IS NOT NULL) * 100), 0)::bigint AS received_cents,
      COALESCE(ROUND(SUM(total) FILTER (WHERE paid_at IS NULL AND status <> 'void') * 100), 0)::bigint AS open_cents,
      COALESCE(ROUND(SUM(platform_fee) FILTER (WHERE paid_at IS NULL AND status <> 'void') * 100), 0)::bigint AS fee_cents
    FROM invoices
    WHERE worker_id = v_worker AND EXTRACT(YEAR FROM issued_at) = p_year
  ),
  exp AS (
    SELECT COALESCE(ROUND(SUM(amount) * 100), 0)::bigint AS cents
    FROM expenses
    WHERE worker_id = v_worker
      AND EXTRACT(YEAR FROM expense_date) = p_year
  ),
  le AS (
    SELECT
      COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'manual_income' AND status <> 'void'), 0) AS manual_income_cents,
      COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'payment_received' AND status <> 'void'), 0) AS manual_received_cents,
      COALESCE(SUM(amount_cents) FILTER (WHERE kind IN ('expense_extra','adjustment') AND status <> 'void'), 0) AS extra_expense_cents,
      COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'mileage' AND status <> 'void'), 0) AS mileage_cents,
      COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'per_diem' AND status <> 'void'), 0) AS per_diem_cents,
      COALESCE(SUM((details->>'miles')::numeric) FILTER (WHERE kind = 'mileage' AND status <> 'void'), 0) AS miles
    FROM worker_ledger_entries
    WHERE worker_id = v_worker AND EXTRACT(YEAR FROM entry_date) = p_year
  ),
  per_company AS (
    SELECT
      e.company_id,
      c.name AS company_name,
      COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind IN ('manual_income','payment_received','expense_extra','adjustment')), 0) AS net_cents,
      COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'mileage'), 0) AS mileage_cents,
      COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'per_diem'), 0) AS per_diem_cents
    FROM worker_ledger_entries e
    LEFT JOIN companies c ON c.id = e.company_id
    WHERE e.worker_id = v_worker
      AND EXTRACT(YEAR FROM e.entry_date) = p_year
      AND e.status <> 'void'
      AND e.company_id IS NOT NULL
    GROUP BY e.company_id, c.name
  )
  SELECT jsonb_build_object(
    'year', p_year,
    'earned_cents', (SELECT cents FROM ts) + (SELECT manual_income_cents FROM le),
    'billed_cents', (SELECT received_cents FROM inv) + (SELECT open_cents FROM inv),
    'received_cents', (SELECT received_cents FROM inv) + (SELECT manual_received_cents FROM le),
    'outstanding_cents', GREATEST(
      (SELECT open_cents FROM inv) + (SELECT manual_income_cents FROM le)
        - (SELECT manual_received_cents FROM le), 0),
    'platform_fees_cents', (SELECT fee_cents FROM inv),
    'expenses_cents', (SELECT cents FROM exp) + (SELECT extra_expense_cents FROM le),
    'mileage_cents', (SELECT mileage_cents FROM le),
    'per_diem_cents', (SELECT per_diem_cents FROM le),
    'total_miles', (SELECT miles FROM le),
    'by_company', COALESCE((
      SELECT jsonb_agg(row_to_json(pc)) FROM per_company pc
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION ledger_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger_summary(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Start-pack onboarding RPCs
-- ---------------------------------------------------------------------------

-- Standard start-pack item keys. Order matters for display.
CREATE OR REPLACE FUNCTION onboarding_item_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'deal_memo', 'w4', 'state_tax_form', 'i9',
    'direct_deposit', 'union_card', 'coi',
    'emergency_contact', 'nda', 'safety_cert'
  ];
$$;

-- Get (or lazily create) the onboarding row for a company the worker has a
-- relationship with. "Relationship" = shared shift assignment, invoice, or
-- expense — prevents checklist spam toward arbitrary companies.
CREATE OR REPLACE FUNCTION onboarding_get(p_company_id uuid)
RETURNS gig_onboarding LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_worker uuid := current_profile_id();
  v_row gig_onboarding;
BEGIN
  IF v_worker IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM gig_onboarding
  WHERE worker_id = v_worker AND company_id = p_company_id;
  IF FOUND THEN RETURN v_row; END IF;

  -- Verify a real relationship exists before creating the checklist.
  IF NOT EXISTS (
    SELECT 1 FROM shift_assignments sa
    JOIN shifts s ON s.id = sa.shift_id
    JOIN events ev ON ev.id = s.event_id
    WHERE sa.worker_id = v_worker AND ev.company_id = p_company_id
  ) AND NOT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.worker_id = v_worker AND i.company_id = p_company_id
  ) AND NOT EXISTS (
    SELECT 1 FROM expenses e
    JOIN gigs g ON g.id = e.gig_id
    WHERE e.worker_id = v_worker AND g.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'No work relationship with this company';
  END IF;

  INSERT INTO gig_onboarding (worker_id, company_id, items)
  VALUES (v_worker, p_company_id,
          (SELECT jsonb_object_agg(k, '"missing"'::jsonb)
           FROM unnest(onboarding_item_keys()) k))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION onboarding_get(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding_get(uuid) TO authenticated;

-- List companies the worker has a relationship with but no checklist yet —
-- drives the "start packs waiting" UI.
CREATE OR REPLACE FUNCTION onboarding_companies()
RETURNS TABLE(company_id uuid, company_name text, first_seen timestamptz)
LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
  WITH rel AS (
    SELECT ev.company_id, MIN(sa.confirmed_at) AS first_seen
    FROM shift_assignments sa
    JOIN shifts s ON s.id = sa.shift_id
    JOIN events ev ON ev.id = s.event_id
    WHERE sa.worker_id = current_profile_id()
    GROUP BY ev.company_id
    UNION ALL
    SELECT i.company_id, MIN(i.issued_at)
    FROM invoices i WHERE i.worker_id = current_profile_id()
    GROUP BY i.company_id
  )
  SELECT r.company_id, c.name, MIN(r.first_seen) AS first_seen
  FROM rel r JOIN companies c ON c.id = r.company_id
  WHERE NOT EXISTS (
    SELECT 1 FROM gig_onboarding o
    WHERE o.worker_id = current_profile_id() AND o.company_id = r.company_id
  )
  GROUP BY r.company_id, c.name
  ORDER BY first_seen;
$$;

REVOKE EXECUTE ON FUNCTION onboarding_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding_companies() TO authenticated;

-- Transition one checklist item. Workers: missing/submitted only.
-- Company owner/admin: confirmed/waived only. The trigger double-checks.
CREATE OR REPLACE FUNCTION onboarding_update_item(
  p_company_id uuid,
  p_item text,
  p_state text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_worker uuid := current_profile_id();
  v_row gig_onboarding;
BEGIN
  IF v_worker IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_item IS NULL OR NOT (p_item = ANY(onboarding_item_keys())) THEN
    RAISE EXCEPTION 'Unknown onboarding item: %', p_item;
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('missing','submitted','confirmed','waived') THEN
    RAISE EXCEPTION 'Invalid state: %', p_state;
  END IF;

  SELECT * INTO v_row FROM gig_onboarding
  WHERE worker_id = v_worker AND company_id = p_company_id;
  IF NOT FOUND THEN
    PERFORM onboarding_get(p_company_id);  -- creates if relationship exists
    SELECT * INTO v_row FROM gig_onboarding
    WHERE worker_id = v_worker AND company_id = p_company_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding row unavailable'; END IF;

  UPDATE gig_onboarding
  SET items = jsonb_set(items, ARRAY[p_item], to_jsonb(p_state)),
      updated_at = now(),
      status = CASE
        WHEN (SELECT bool_and((value #>> '{}') IN ('confirmed','waived'))
               FROM jsonb_each(items || jsonb_build_object(p_item, to_jsonb(p_state))))
          THEN 'complete'
        WHEN items = '{}'::jsonb THEN 'not_started'
        ELSE 'in_progress'
      END
  WHERE id = v_row.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION onboarding_update_item(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding_update_item(uuid, text, text) TO authenticated;
