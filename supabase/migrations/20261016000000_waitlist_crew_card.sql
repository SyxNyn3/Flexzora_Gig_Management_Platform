/*
  # Waitlist "crew card" fields

  Extends `waiting_list` so founding-crew signups capture a real crew profile
  (name, phone + SMS consent, skills/certs, experience, travel availability)
  instead of just an email. All columns are additive and nullable — existing
  rows are unaffected.
*/

ALTER TABLE waiting_list
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS experience_years text,
  ADD COLUMN IF NOT EXISTS travel_availability text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS union_affiliation text,
  ADD COLUMN IF NOT EXISTS has_vehicle boolean,
  ADD COLUMN IF NOT EXISTS day_rate_min integer,
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS profile_completeness integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS companies_worked jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS markets_worked text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorite_markets text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_regions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vehicles text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS farthest_travel text,
  ADD COLUMN IF NOT EXISTS willing_farther boolean,
  ADD COLUMN IF NOT EXISTS has_passport boolean,
  ADD COLUMN IF NOT EXISTS overseas_willing boolean,
  ADD COLUMN IF NOT EXISTS departure_readiness text,
  ADD COLUMN IF NOT EXISTS call_response_time text,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS referred_crew text;

CREATE INDEX IF NOT EXISTS idx_waiting_list_market ON waiting_list (market_city);
