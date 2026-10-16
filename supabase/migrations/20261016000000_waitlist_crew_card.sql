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
  ADD COLUMN IF NOT EXISTS profile_completeness integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_waiting_list_market ON waiting_list (market_city);
