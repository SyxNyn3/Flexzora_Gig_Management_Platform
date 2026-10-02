/*
  # Marketplace Core: Events, Shifts, Rosters, Timesheets, Escrow & Invoices

  Turns the gig board into a two-sided crew marketplace for live-event production.

  1. Geospatial
    - Enables PostGIS; adds `geo` (geography point) to profiles and venues
    - `nearby_shifts(lat, lng, radius_m)` RPC for radius search

  2. New Tables
    - `certification_types`  canonical credential catalog (OSHA-10/30, ETCP Rigger, Forklift...)
    - `venues`               physical sites with geofence radius
    - `events`               multi-day productions owned by a company
    - `event_budgets`        owner-only budget cap / platform fee per event
    - `shifts`               modular labor calls inside an event (skill tier, headcount, window, rate)
    - `shift_assignments`    offers/applications/bookings between a shift and a worker
    - `preferred_rosters`    company "trusted crew" lists (match boost + first-wave broadcast)
    - `overtime_rules`       regional OT rules (daily/weekly thresholds, multipliers)
    - `timesheets`           geofenced clock-in/out, computed regular/OT hours, approval flow
    - `escrow_deposits`      funds held per event
    - `invoices`             contractor invoices auto-generated on timesheet approval
    - `payouts`              transfer records (Stripe Connect) per invoice

  3. Functions
    - `validate_clock_event` geofence + window validation
    - `approve_timesheet`    one-click approval: computes pay, creates invoice, debits escrow, queues payout
    - `worker_reliability`   rolling no-show / completion metrics used by the matching engine

  4. Security
    - RLS on every table; companies manage their own events, workers manage their own bookings/timesheets
*/

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('draft', 'published', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE shift_status AS ENUM ('draft', 'open', 'filled', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM (
    'offered',      -- direct-book offer sent by company
    'applied',      -- worker applied from marketplace
    'confirmed',    -- both sides agreed; worker is booked
    'declined',     -- worker declined offer
    'rejected',     -- company rejected application
    'withdrawn',    -- worker pulled out after confirming
    'no_show',      -- worker did not clock in
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE assignment_source AS ENUM ('direct_book', 'roster_broadcast', 'public_marketplace');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE timesheet_status AS ENUM ('open', 'submitted', 'approved', 'disputed', 'paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('queued', 'processing', 'paid', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE escrow_status AS ENUM ('pending', 'funded', 'partially_released', 'released', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- Profile geolocation + payout account
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS travel_radius_km integer DEFAULT 80;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS day_rate numeric(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payouts_enabled boolean DEFAULT false;

CREATE OR REPLACE FUNCTION sync_profile_geo() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geo := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_sync_geo ON profiles;
CREATE TRIGGER profiles_sync_geo BEFORE INSERT OR UPDATE OF latitude, longitude ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_profile_geo();

CREATE INDEX IF NOT EXISTS profiles_geo_idx ON profiles USING GIST (geo);

-- ---------------------------------------------------------------------------
-- Certification catalog (gatekeeper credentials)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certification_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  issuing_body text,
  category text NOT NULL, -- safety | rigging | equipment | electrical | medical
  requires_expiry boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO certification_types (code, name, issuing_body, category) VALUES
  ('OSHA_10',        'OSHA 10-Hour General Industry',      'OSHA',   'safety'),
  ('OSHA_30',        'OSHA 30-Hour General Industry',      'OSHA',   'safety'),
  ('ETCP_ARENA',     'ETCP Certified Rigger – Arena',      'ESTA',   'rigging'),
  ('ETCP_THEATRE',   'ETCP Certified Rigger – Theatre',    'ESTA',   'rigging'),
  ('ETCP_ELECTRIC',  'ETCP Entertainment Electrician',     'ESTA',   'electrical'),
  ('FORKLIFT',       'Powered Industrial Truck (Forklift)','OSHA',   'equipment'),
  ('AERIAL_LIFT',    'Aerial / Scissor Lift Operator',     'ANSI',   'equipment'),
  ('CPR_FIRST_AID',  'CPR / First Aid',                    'Red Cross','medical'),
  ('FALL_PROTECT',   'Fall Protection Competent Person',   'OSHA',   'safety')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE certifications ADD COLUMN IF NOT EXISTS cert_type_code text REFERENCES certification_types(code);
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- `verified` is set by platform review (service role), never by the credential owner;
-- editing the substance of a verified credential sends it back for review.
CREATE OR REPLACE FUNCTION guard_certification_verification() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.verified_at := NULL;
  ELSIF NEW.verified IS DISTINCT FROM OLD.verified OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'Credential verification is set by platform review';
  ELSIF OLD.verified AND (
        NEW.name IS DISTINCT FROM OLD.name
     OR NEW.cert_type_code IS DISTINCT FROM OLD.cert_type_code
     OR NEW.issuing_organization IS DISTINCT FROM OLD.issuing_organization
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
     OR NEW.credential_id IS DISTINCT FROM OLD.credential_id
     OR NEW.credential_url IS DISTINCT FROM OLD.credential_url) THEN
    NEW.verified := false;
    NEW.verified_at := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certifications_verification_guard ON certifications;
CREATE TRIGGER certifications_verification_guard BEFORE INSERT OR UPDATE ON certifications
  FOR EACH ROW EXECUTE FUNCTION guard_certification_verification();
CREATE INDEX IF NOT EXISTS certifications_type_idx ON certifications (worker_id, cert_type_code) WHERE is_active;

-- Map credentials entered by name before the catalog existed onto canonical codes
UPDATE certifications SET cert_type_code = CASE
  WHEN name ILIKE '%ETCP%' AND name ILIKE '%theat%'                          THEN 'ETCP_THEATRE'
  WHEN name ILIKE '%ETCP%' AND name ILIKE '%electric%'                       THEN 'ETCP_ELECTRIC'
  WHEN name ILIKE '%ETCP%'                                                   THEN 'ETCP_ARENA'
  WHEN name ILIKE '%OSHA%' AND name ILIKE '%30%'                             THEN 'OSHA_30'
  WHEN name ILIKE '%OSHA%' AND name ILIKE '%10%'                             THEN 'OSHA_10'
  WHEN name ILIKE '%forklift%' OR name ILIKE '%industrial truck%'            THEN 'FORKLIFT'
  WHEN name ILIKE '%aerial%' OR name ILIKE '%scissor%' OR name ILIKE '%boom lift%' THEN 'AERIAL_LIFT'
  WHEN name ILIKE '%CPR%' OR name ILIKE '%first aid%'                        THEN 'CPR_FIRST_AID'
  WHEN name ILIKE '%fall protect%'                                           THEN 'FALL_PROTECT'
END
WHERE cert_type_code IS NULL;

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  city text,
  region text,
  country text DEFAULT 'US',
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geo geography(Point, 4326),
  geofence_radius_m integer NOT NULL DEFAULT 250,
  load_in_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION sync_venue_geo() RETURNS trigger AS $$
BEGIN
  NEW.geo := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venues_sync_geo ON venues;
CREATE TRIGGER venues_sync_geo BEFORE INSERT OR UPDATE OF latitude, longitude ON venues
  FOR EACH ROW EXECUTE FUNCTION sync_venue_geo();

CREATE INDEX IF NOT EXISTS venues_geo_idx ON venues USING GIST (geo);
CREATE INDEX IF NOT EXISTS venues_company_idx ON venues (company_id);

-- ---------------------------------------------------------------------------
-- Overtime rules (regional)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS overtime_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  region text,
  daily_ot_after_hours numeric(4,2) DEFAULT 8,
  daily_dt_after_hours numeric(4,2),          -- double-time threshold (CA = 12)
  weekly_ot_after_hours numeric(5,2) DEFAULT 40,
  ot_multiplier numeric(3,2) DEFAULT 1.5,
  dt_multiplier numeric(3,2) DEFAULT 2.0,
  minimum_call_hours numeric(4,2) DEFAULT 4,  -- industry-standard 4-hour minimum
  meal_penalty_after_hours numeric(4,2),      -- optional meal-break penalty trigger
  created_at timestamptz DEFAULT now()
);

INSERT INTO overtime_rules (code, name, region, daily_ot_after_hours, daily_dt_after_hours, weekly_ot_after_hours, ot_multiplier, dt_multiplier, minimum_call_hours, meal_penalty_after_hours) VALUES
  ('US_FLSA',  'US Federal (FLSA)',        'US',    NULL, NULL, 40, 1.5, 2.0, 4, NULL),
  ('US_CA',    'California',               'US-CA', 8,    12,   40, 1.5, 2.0, 4, 6),
  ('US_NV',    'Nevada',                   'US-NV', 8,    NULL, 40, 1.5, 2.0, 4, NULL),
  ('IATSE_STD','IATSE-style Event Standard','US',   8,    12,   40, 1.5, 2.0, 5, 5)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  event_type text NOT NULL DEFAULT 'concert', -- concert | corporate | festival | theatre | broadcast
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status event_status DEFAULT 'draft',
  overtime_rule_code text REFERENCES overtime_rules(code) DEFAULT 'US_FLSA',
  color text DEFAULT '#3B82F6',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS events_company_idx ON events (company_id, starts_on);

-- Commercial terms live apart from the event row so workers can read the
-- event without seeing the company's budget or fee schedule.
CREATE TABLE IF NOT EXISTS event_budgets (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  budget_cap numeric(12,2),
  platform_fee_pct numeric(5,2) NOT NULL DEFAULT 12.00,
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,                      -- "Load-in", "Show Call", "Load-out"
  role_name text NOT NULL,                  -- "Ground Rigger", "A2", "Stagehand"
  skill_id uuid REFERENCES skills(id),
  min_proficiency integer DEFAULT 1 CHECK (min_proficiency BETWEEN 1 AND 5),
  required_cert_codes text[] DEFAULT '{}',  -- gatekeeper certifications
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  hourly_rate numeric(10,2) NOT NULL,
  status shift_status DEFAULT 'draft',
  broadcast_stage text DEFAULT 'none',      -- none | roster | public
  roster_broadcast_at timestamptz,
  public_broadcast_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS shifts_event_idx ON shifts (event_id, starts_at);
CREATE INDEX IF NOT EXISTS shifts_open_idx ON shifts (starts_at) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- Shift assignments (offers / applications / bookings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status assignment_status NOT NULL DEFAULT 'applied',
  source assignment_source NOT NULL DEFAULT 'public_marketplace',
  match_score numeric(5,2),
  match_breakdown jsonb,
  offered_rate numeric(10,2),
  responded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (shift_id, worker_id)
);

CREATE INDEX IF NOT EXISTS shift_assignments_worker_idx ON shift_assignments (worker_id, status);
CREATE INDEX IF NOT EXISTS shift_assignments_shift_idx ON shift_assignments (shift_id, status);

-- Headcount helpers. Booked = confirmed or already completed (a crew member whose
-- timesheet was approved early still occupied the slot).
CREATE OR REPLACE FUNCTION shift_booked_count(p_shift_id uuid, p_exclude_assignment uuid DEFAULT NULL) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM shift_assignments
  WHERE shift_id = p_shift_id AND status IN ('confirmed', 'completed')
    AND (p_exclude_assignment IS NULL OR id <> p_exclude_assignment)
$$;

-- Serialises bookings per shift (advisory lock) and reports whether one more
-- confirmation fits under headcount.
CREATE OR REPLACE FUNCTION shift_has_room(p_shift_id uuid, p_exclude_assignment uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_headcount integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('shift_booking:' || p_shift_id::text));
  SELECT headcount INTO v_headcount FROM shifts WHERE id = p_shift_id;
  RETURN shift_booked_count(p_shift_id, p_exclude_assignment) < COALESCE(v_headcount, 0);
END $$;

-- Keep shift status in sync with booked headcount. Definer: fires for worker-side
-- transitions too, which must count assignments the worker cannot read.
CREATE OR REPLACE FUNCTION sync_shift_fill_status() RETURNS trigger
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift_id uuid := COALESCE(NEW.shift_id, OLD.shift_id);
  v_confirmed integer;
  v_headcount integer;
BEGIN
  v_confirmed := shift_booked_count(v_shift_id);
  SELECT headcount INTO v_headcount FROM shifts WHERE id = v_shift_id;
  UPDATE shifts SET
    status = CASE
      WHEN status IN ('in_progress', 'completed', 'cancelled', 'draft') THEN status
      WHEN v_confirmed >= v_headcount THEN 'filled'::shift_status
      ELSE 'open'::shift_status END,
    updated_at = now()
  WHERE id = v_shift_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_assignments_fill ON shift_assignments;
CREATE TRIGGER shift_assignments_fill AFTER INSERT OR UPDATE OF status OR DELETE ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_shift_fill_status();

-- Direct (PostgREST) updates may only walk the state machine from their own side;
-- SECURITY DEFINER RPCs run as the function owner and are exempt.
CREATE OR REPLACE FUNCTION guard_assignment_update() RETURNS trigger AS $$
DECLARE
  v_company boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.shift_id <> OLD.shift_id OR NEW.worker_id <> OLD.worker_id OR NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'Assignment shift, worker and source are immutable';
  END IF;

  v_company := owns_shift(OLD.shift_id);

  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' AND NOT shift_has_room(OLD.shift_id, OLD.id) THEN
    RAISE EXCEPTION 'This call is already fully staffed';
  END IF;

  IF v_company THEN
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'applied'   AND NEW.status IN ('confirmed', 'rejected'))
         OR (OLD.status = 'offered'   AND NEW.status = 'rejected')
         OR (OLD.status = 'confirmed' AND NEW.status IN ('no_show', 'rejected'))
         OR (OLD.status IN ('declined', 'withdrawn', 'rejected') AND NEW.status = 'offered')) THEN
      RAISE EXCEPTION 'Company cannot move assignment from % to %', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.worker_id = current_profile_id() THEN
    IF NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
       OR NEW.match_score IS DISTINCT FROM OLD.match_score
       OR NEW.match_breakdown IS DISTINCT FROM OLD.match_breakdown THEN
      RAISE EXCEPTION 'Workers cannot change offer terms';
    END IF;
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'offered' AND NEW.status IN ('confirmed', 'declined'))
         OR (OLD.status IN ('applied', 'confirmed') AND NEW.status = 'withdrawn')) THEN
      RAISE EXCEPTION 'Worker cannot move assignment from % to %', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this assignment';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_assignments_guard ON shift_assignments;
CREATE TRIGGER shift_assignments_guard BEFORE UPDATE ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION guard_assignment_update();

CREATE OR REPLACE FUNCTION guard_assignment_insert() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.status = 'confirmed' AND NOT shift_has_room(NEW.shift_id) THEN
    RAISE EXCEPTION 'This call is already fully staffed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_assignments_guard_insert ON shift_assignments;
CREATE TRIGGER shift_assignments_guard_insert BEFORE INSERT ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION guard_assignment_insert();

-- ---------------------------------------------------------------------------
-- Preferred rosters ("trusted crew")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS preferred_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'preferred', -- preferred | core | blocked
  notes text,
  added_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, worker_id)
);

CREATE INDEX IF NOT EXISTS preferred_rosters_company_idx ON preferred_rosters (company_id, tier);

-- ---------------------------------------------------------------------------
-- Timesheets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE REFERENCES shift_assignments(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in_at timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_distance_m numeric(10,2),
  clock_in_verified boolean DEFAULT false,
  clock_out_at timestamptz,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_distance_m numeric(10,2),
  clock_out_verified boolean DEFAULT false,
  break_minutes integer DEFAULT 0,
  regular_hours numeric(6,2) DEFAULT 0,
  overtime_hours numeric(6,2) DEFAULT 0,
  doubletime_hours numeric(6,2) DEFAULT 0,
  gross_pay numeric(10,2) DEFAULT 0,
  status timesheet_status DEFAULT 'open',
  worker_notes text,
  manager_notes text,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timesheets_worker_idx ON timesheets (worker_id, status);
CREATE INDEX IF NOT EXISTS timesheets_shift_idx ON timesheets (shift_id, status);

-- Clock stamps, GPS evidence and computed pay are written only by the RPCs.
-- Workers may annotate (notes, break); companies may dispute/undispute.
CREATE OR REPLACE FUNCTION guard_timesheet_update() RETURNS trigger AS $$
DECLARE
  v_company boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.assignment_id <> OLD.assignment_id OR NEW.shift_id <> OLD.shift_id OR NEW.worker_id <> OLD.worker_id
     OR NEW.clock_in_at IS DISTINCT FROM OLD.clock_in_at OR NEW.clock_in_lat IS DISTINCT FROM OLD.clock_in_lat
     OR NEW.clock_in_lng IS DISTINCT FROM OLD.clock_in_lng OR NEW.clock_in_distance_m IS DISTINCT FROM OLD.clock_in_distance_m
     OR NEW.clock_in_verified IS DISTINCT FROM OLD.clock_in_verified
     OR NEW.clock_out_at IS DISTINCT FROM OLD.clock_out_at OR NEW.clock_out_lat IS DISTINCT FROM OLD.clock_out_lat
     OR NEW.clock_out_lng IS DISTINCT FROM OLD.clock_out_lng OR NEW.clock_out_distance_m IS DISTINCT FROM OLD.clock_out_distance_m
     OR NEW.clock_out_verified IS DISTINCT FROM OLD.clock_out_verified
     OR NEW.regular_hours IS DISTINCT FROM OLD.regular_hours OR NEW.overtime_hours IS DISTINCT FROM OLD.overtime_hours
     OR NEW.doubletime_hours IS DISTINCT FROM OLD.doubletime_hours OR NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Clock, GPS and pay fields are system-managed';
  END IF;

  v_company := owns_shift(OLD.shift_id);

  IF v_company THEN
    IF NOT (NEW.status = OLD.status
         OR (OLD.status IN ('submitted', 'disputed') AND NEW.status IN ('submitted', 'disputed'))) THEN
      RAISE EXCEPTION 'Use approve_timesheet() to approve a timesheet';
    END IF;
  ELSIF OLD.worker_id = current_profile_id() THEN
    IF NEW.status <> OLD.status OR NEW.manager_notes IS DISTINCT FROM OLD.manager_notes THEN
      RAISE EXCEPTION 'Workers may only edit notes and break minutes';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this timesheet';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timesheets_guard ON timesheets;
CREATE TRIGGER timesheets_guard BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION guard_timesheet_update();

-- ---------------------------------------------------------------------------
-- Escrow, invoices, payouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escrow_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  released_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  status escrow_status DEFAULT 'pending',
  stripe_payment_intent_id text,
  funded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escrow_event_idx ON escrow_deposits (event_id);

-- Called by the Stripe webhook (service role) once the deposit's payment settles.
CREATE OR REPLACE FUNCTION mark_escrow_funded(p_deposit_id uuid, p_payment_ref text)
RETURNS escrow_deposits
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row escrow_deposits%ROWTYPE;
BEGIN
  UPDATE escrow_deposits
     SET status = 'funded', stripe_payment_intent_id = COALESCE(p_payment_ref, stripe_payment_intent_id), funded_at = now()
   WHERE id = p_deposit_id AND status = 'pending'
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Escrow deposit % not found or already funded', p_deposit_id; END IF;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION mark_escrow_funded(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL DEFAULT ('FLX-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  timesheet_id uuid UNIQUE REFERENCES timesheets(id) ON DELETE SET NULL,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(10,2) NOT NULL,
  platform_fee numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  status invoice_status DEFAULT 'issued',
  tax_year integer NOT NULL DEFAULT extract(year FROM now())::integer,
  issued_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_worker_year_idx ON invoices (worker_id, tax_year);
CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id, status);

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  method text NOT NULL DEFAULT 'ach', -- ach | instant
  status payout_status DEFAULT 'queued',
  stripe_transfer_id text,
  failure_reason text,
  expected_arrival_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_worker_idx ON payouts (worker_id, status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['venues','events','shifts','shift_assignments','timesheets','escrow_deposits','payouts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RPC: nearby open shifts (radius search)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nearby_shifts(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 80000)
RETURNS TABLE (shift_id uuid, distance_m double precision)
LANGUAGE sql STABLE AS $$
  SELECT s.id, ST_Distance(v.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
  FROM shifts s
  JOIN events e ON e.id = s.event_id
  JOIN venues v ON v.id = e.venue_id
  WHERE s.status = 'open'
    AND s.starts_at > now()
    AND ST_DWithin(v.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  ORDER BY 2;
$$;

-- ---------------------------------------------------------------------------
-- RPC: worker reliability (feeds Historical Performance weight)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION worker_reliability(p_worker_id uuid)
RETURNS TABLE (completed integer, no_shows integer, withdrawn integer, reliability_rate numeric, avg_rating numeric)
LANGUAGE sql STABLE AS $$
  WITH a AS (
    SELECT
      count(*) FILTER (WHERE status = 'completed')::integer AS completed,
      count(*) FILTER (WHERE status = 'no_show')::integer AS no_shows,
      count(*) FILTER (WHERE status = 'withdrawn')::integer AS withdrawn
    FROM shift_assignments WHERE worker_id = p_worker_id
  ), r AS (
    SELECT avg(rating)::numeric(3,2) AS avg_rating FROM reviews WHERE reviewee_id = p_worker_id
  )
  SELECT a.completed, a.no_shows, a.withdrawn,
    CASE WHEN a.completed + a.no_shows + a.withdrawn = 0 THEN NULL
         ELSE round(a.completed::numeric / (a.completed + a.no_shows + a.withdrawn), 3) END,
    r.avg_rating
  FROM a, r;
$$;

-- ---------------------------------------------------------------------------
-- RPC: geofenced clock in / out
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_clock_event(
  p_assignment_id uuid,
  p_kind text,                 -- 'in' | 'out'
  p_lat double precision,
  p_lng double precision
) RETURNS timesheets
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  IF v_venue.id IS NULL THEN
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
      clock_in_distance_m = v_distance, clock_in_verified = (v_venue.id IS NOT NULL)
      WHERE id = v_ts.id RETURNING * INTO v_ts;
  ELSIF p_kind = 'out' THEN
    IF v_ts.clock_in_at IS NULL THEN RAISE EXCEPTION 'Not clocked in'; END IF;
    IF v_ts.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'Already clocked out'; END IF;
    UPDATE timesheets SET clock_out_at = now(), clock_out_lat = p_lat, clock_out_lng = p_lng,
      clock_out_distance_m = v_distance, clock_out_verified = (v_venue.id IS NOT NULL AND v_within),
      status = 'submitted'
      WHERE id = v_ts.id RETURNING * INTO v_ts;
  ELSE
    RAISE EXCEPTION 'Unknown clock kind %', p_kind;
  END IF;

  RETURN v_ts;
END $$;

-- ---------------------------------------------------------------------------
-- RPC: approve timesheet -> compute OT, invoice, escrow release, payout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_timesheet(
  p_timesheet_id uuid,
  p_break_minutes integer DEFAULT NULL,
  p_payout_method text DEFAULT 'ach'
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ts timesheets%ROWTYPE;
  v_assignment shift_assignments%ROWTYPE;
  v_shift shifts%ROWTYPE;
  v_event events%ROWTYPE;
  v_rule overtime_rules%ROWTYPE;
  v_caller uuid;
  v_rate numeric;
  v_fee_pct numeric;
  v_worked numeric;
  v_prior_weekly numeric;
  v_room numeric;
  v_reg numeric; v_ot numeric; v_dt numeric;
  v_gross numeric; v_fee numeric;
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
  IF NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_event.company_id AND c.created_by = v_caller) THEN
    RAISE EXCEPTION 'Only the hiring company can approve this timesheet';
  END IF;
  SELECT * INTO v_rule FROM overtime_rules WHERE code = COALESCE(v_event.overtime_rule_code, 'US_FLSA');
  v_fee_pct := COALESCE((SELECT platform_fee_pct FROM event_budgets WHERE event_id = v_event.id), 12);

  -- negotiated direct-book rate wins over the posted call rate
  v_rate := COALESCE(v_assignment.offered_rate, v_shift.hourly_rate);

  v_worked := GREATEST(
    extract(epoch FROM (v_ts.clock_out_at - v_ts.clock_in_at)) / 3600.0 - COALESCE(p_break_minutes, v_ts.break_minutes, 0) / 60.0,
    COALESCE(v_rule.minimum_call_hours, 0));

  -- daily split: regular / OT / DT
  v_dt := CASE WHEN v_rule.daily_dt_after_hours IS NOT NULL THEN GREATEST(v_worked - v_rule.daily_dt_after_hours, 0) ELSE 0 END;
  v_ot := CASE WHEN v_rule.daily_ot_after_hours IS NOT NULL THEN GREATEST(v_worked - v_dt - v_rule.daily_ot_after_hours, 0) ELSE 0 END;
  v_reg := v_worked - v_ot - v_dt;

  -- weekly threshold: regular hours already approved for this company in the same
  -- ISO workweek consume the cap; the remainder of this shift is promoted to OT.
  IF v_rule.weekly_ot_after_hours IS NOT NULL THEN
    -- serialise approvals per worker+company so concurrent calls cannot both read the
    -- same prior total and each pay straight time past the cap
    PERFORM pg_advisory_xact_lock(hashtext('weekly_ot:' || v_ts.worker_id::text || ':' || v_event.company_id::text));
    SELECT COALESCE(sum(t.regular_hours), 0) INTO v_prior_weekly
    FROM timesheets t
    JOIN shifts s ON s.id = t.shift_id
    JOIN events e ON e.id = s.event_id
    WHERE t.worker_id = v_ts.worker_id
      AND t.id <> v_ts.id
      AND t.status IN ('approved', 'paid')
      AND e.company_id = v_event.company_id
      AND date_trunc('week', t.clock_in_at) = date_trunc('week', v_ts.clock_in_at);
    v_room := GREATEST(v_rule.weekly_ot_after_hours - v_prior_weekly, 0);
    IF v_reg > v_room THEN
      v_ot := v_ot + (v_reg - v_room);
      v_reg := v_room;
    END IF;
  END IF;

  v_gross := round(v_reg * v_rate + v_ot * v_rate * v_rule.ot_multiplier + v_dt * v_rate * v_rule.dt_multiplier, 2);
  v_fee := round(v_gross * v_fee_pct / 100.0, 2);

  -- draw the gross from funded deposits (oldest first); refuse if under-funded
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
    ),
    v_gross, v_fee, v_gross
  ) RETURNING * INTO v_invoice;

  INSERT INTO payouts (invoice_id, worker_id, amount, method, expected_arrival_at)
  VALUES (v_invoice.id, v_ts.worker_id, v_gross, p_payout_method,
    CASE WHEN p_payout_method = 'instant' THEN now() + interval '30 minutes' ELSE now() + interval '2 days' END);

  RETURN v_invoice;
END $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE certification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferred_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT id FROM profiles WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION owns_company(p_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.created_by = current_profile_id())
$$;

-- A call is discoverable by the caller when it is live on the public marketplace,
-- or roster-broadcast by a company whose trusted roster includes them (and they
-- are not blocked by that company).
-- Ownership helpers run as definer so policies never re-enter another table's RLS
-- (events ⇄ shifts would otherwise recurse).
CREATE OR REPLACE FUNCTION owns_event(p_event_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM events e WHERE e.id = p_event_id AND owns_company(e.company_id))
$$;

CREATE OR REPLACE FUNCTION owns_shift(p_shift_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM shifts s WHERE s.id = p_shift_id AND owns_event(s.event_id))
$$;

CREATE OR REPLACE FUNCTION worker_can_see_shift(p_shift_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM shifts s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = p_shift_id
      AND s.status IN ('open', 'filled')
      AND e.status <> 'draft'
      AND NOT EXISTS (SELECT 1 FROM preferred_rosters r
                      WHERE r.company_id = e.company_id AND r.worker_id = current_profile_id() AND r.tier = 'blocked')
      AND (s.broadcast_stage = 'public'
        OR (s.broadcast_stage = 'roster' AND EXISTS (
              SELECT 1 FROM preferred_rosters r
              WHERE r.company_id = e.company_id AND r.worker_id = current_profile_id() AND r.tier <> 'blocked')))
  )
$$;

CREATE OR REPLACE FUNCTION is_party_to_shift(p_shift_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = p_shift_id AND a.worker_id = current_profile_id())
$$;

DROP POLICY IF EXISTS "cert types readable" ON certification_types;
CREATE POLICY "cert types readable" ON certification_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ot rules readable" ON overtime_rules;
CREATE POLICY "ot rules readable" ON overtime_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "venues readable" ON venues;
CREATE POLICY "venues readable" ON venues FOR SELECT TO authenticated
  USING (owns_company(company_id)
     OR EXISTS (SELECT 1 FROM events e JOIN shifts s ON s.event_id = e.id
                WHERE e.venue_id = venues.id AND (worker_can_see_shift(s.id) OR is_party_to_shift(s.id))));
DROP POLICY IF EXISTS "venues managed by company" ON venues;
CREATE POLICY "venues managed by company" ON venues FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP POLICY IF EXISTS "events readable" ON events;
CREATE POLICY "events readable" ON events FOR SELECT TO authenticated
  USING (owns_company(company_id)
     OR EXISTS (SELECT 1 FROM shifts s WHERE s.event_id = events.id AND (worker_can_see_shift(s.id) OR is_party_to_shift(s.id))));
DROP POLICY IF EXISTS "events managed by company" ON events;
CREATE POLICY "events managed by company" ON events FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP POLICY IF EXISTS "event budgets owner only" ON event_budgets;
CREATE POLICY "event budgets owner only" ON event_budgets FOR ALL TO authenticated
  USING (owns_event(event_id))
  WITH CHECK (owns_event(event_id));

DROP POLICY IF EXISTS "shifts readable" ON shifts;
CREATE POLICY "shifts readable" ON shifts FOR SELECT TO authenticated
  USING (worker_can_see_shift(id) OR is_party_to_shift(id)
     OR owns_event(event_id));
DROP POLICY IF EXISTS "shifts managed by company" ON shifts;
CREATE POLICY "shifts managed by company" ON shifts FOR ALL TO authenticated
  USING (owns_event(event_id))
  WITH CHECK (owns_event(event_id));

DROP POLICY IF EXISTS "assignments visible to parties" ON shift_assignments;
CREATE POLICY "assignments visible to parties" ON shift_assignments FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR owns_shift(shift_id));
DROP POLICY IF EXISTS "workers apply" ON shift_assignments;
CREATE POLICY "workers apply" ON shift_assignments FOR INSERT TO authenticated
  WITH CHECK (
    (worker_id = current_profile_id() AND status = 'applied' AND offered_rate IS NULL
       AND source IN ('roster_broadcast', 'public_marketplace')
       AND worker_can_see_shift(shift_id)
       AND EXISTS (SELECT 1 FROM shifts s WHERE s.id = shift_id AND s.status = 'open'))
    OR owns_shift(shift_id));
DROP POLICY IF EXISTS "parties update assignment" ON shift_assignments;
-- allowed transitions per party are enforced by guard_assignment_update()
CREATE POLICY "parties update assignment" ON shift_assignments FOR UPDATE TO authenticated
  USING (worker_id = current_profile_id()
     OR owns_shift(shift_id));

DROP POLICY IF EXISTS "roster visible to company and member" ON preferred_rosters;
CREATE POLICY "roster visible to company and member" ON preferred_rosters FOR SELECT TO authenticated
  USING (owns_company(company_id) OR worker_id = current_profile_id());
DROP POLICY IF EXISTS "roster managed by company" ON preferred_rosters;
CREATE POLICY "roster managed by company" ON preferred_rosters FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP POLICY IF EXISTS "timesheets visible to parties" ON timesheets;
CREATE POLICY "timesheets visible to parties" ON timesheets FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR owns_shift(shift_id));
DROP POLICY IF EXISTS "workers edit own open timesheets" ON timesheets;
-- column-level restrictions are enforced by guard_timesheet_update()
CREATE POLICY "workers edit own open timesheets" ON timesheets FOR UPDATE TO authenticated
  USING (worker_id = current_profile_id() AND status IN ('open','submitted'));
DROP POLICY IF EXISTS "company edits timesheets" ON timesheets;
CREATE POLICY "company edits timesheets" ON timesheets FOR UPDATE TO authenticated
  USING (owns_shift(shift_id));

DROP POLICY IF EXISTS "escrow visible to company" ON escrow_deposits;
CREATE POLICY "escrow visible to company" ON escrow_deposits FOR SELECT TO authenticated
  USING (owns_company(company_id));
-- companies open a deposit as 'pending'; only mark_escrow_funded() (webhook) can fund it
DROP POLICY IF EXISTS "company opens pending deposit" ON escrow_deposits;
CREATE POLICY "company opens pending deposit" ON escrow_deposits FOR INSERT TO authenticated
  WITH CHECK (owns_company(company_id) AND status = 'pending' AND released_amount = 0 AND funded_at IS NULL
     AND EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.company_id = escrow_deposits.company_id));

DROP POLICY IF EXISTS "invoices visible to parties" ON invoices;
CREATE POLICY "invoices visible to parties" ON invoices FOR SELECT TO authenticated
  USING (worker_id = current_profile_id() OR owns_company(company_id));

DROP POLICY IF EXISTS "payouts visible to parties" ON payouts;
CREATE POLICY "payouts visible to parties" ON payouts FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND owns_company(i.company_id)));

GRANT EXECUTE ON FUNCTION nearby_shifts(double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION worker_reliability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION worker_can_see_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION owns_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION shift_booked_count(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION shift_has_room(uuid, uuid) TO authenticated;

-- Hiring companies see only the windows a worker has blocked out (no free-time detail),
-- so matching can zero availability on declared conflicts.
DROP POLICY IF EXISTS "companies see blocked availability" ON availability;
CREATE POLICY "companies see blocked availability" ON availability FOR SELECT TO authenticated
  USING (is_available = false AND EXISTS (SELECT 1 FROM companies c WHERE c.created_by = current_profile_id()));
GRANT EXECUTE ON FUNCTION owns_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_party_to_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_clock_event(uuid, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_timesheet(uuid, integer, text) TO authenticated;
