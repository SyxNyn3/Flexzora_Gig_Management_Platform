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
  ADD COLUMN IF NOT EXISTS referred_crew text,
  ADD COLUMN IF NOT EXISTS preferred_areas text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_own_business boolean,
  ADD COLUMN IF NOT EXISTS business_names text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business_arrangement text,
  ADD COLUMN IF NOT EXISTS signup_ip inet;

/* per-IP call log for waitlist_fill_crew_card — enabled RLS with zero
   policies means PostgREST/anon can't touch it; only SECURITY DEFINER
   internals (running as owner) read and write it */
CREATE TABLE IF NOT EXISTS public.waitlist_rpc_hits (
  ip inet NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.waitlist_rpc_hits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_waitlist_rpc_hits_ip_ts ON public.waitlist_rpc_hits (ip, ts);

CREATE INDEX IF NOT EXISTS idx_waiting_list_market ON waiting_list (market_city);

/*
  # waitlist_fill_crew_card — PostgREST-callable crew-card writer

  The deployed submit-waitlist edge function may lag this schema in time:
  it inserts the base row but silently drops fields it doesn't know about.
  This RPC lets the client complete the card right after signup using the
  anon key, without needing an edge-function redeploy.

  Safety model — "first write wins":
   * Row must already exist (the edge function inserted it).
   * Only fills while the card is untouched (full_name IS NULL) AND the row
     is fresh (created in the last 30 min) — a stranger can't claim the card
     of a legacy signup knowing only their email.
   * Once any writer has claimed the card, later anonymous calls change
     nothing, so nobody can overwrite someone's card.
   * 8 calls/min per source IP — fills happen once per signup, so this only
     bites enumeration/flood attempts.
   * sms_consent can only transition false -> true (consent can't be
     revoked through this channel).
   * profile_completeness never decreases.
   * Only crew-card columns are writable — referral, status, verification
     and all auth-owned fields are untouched.
  Once the edge function writes the card itself, this RPC no-ops.
*/
CREATE OR REPLACE FUNCTION public.waitlist_fill_crew_card(
  p_email text,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_sms_consent boolean DEFAULT NULL,
  p_skills text[] DEFAULT NULL,
  p_experience_years text DEFAULT NULL,
  p_travel_availability text[] DEFAULT NULL,
  p_union_affiliation text DEFAULT NULL,
  p_vehicles text[] DEFAULT NULL,
  p_has_vehicle boolean DEFAULT NULL,
  p_day_rate_min integer DEFAULT NULL,
  p_instagram_handle text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_profile_completeness integer DEFAULT NULL,
  p_companies_worked jsonb DEFAULT NULL,
  p_markets_worked text[] DEFAULT NULL,
  p_favorite_markets text[] DEFAULT NULL,
  p_preferred_regions text[] DEFAULT NULL,
  p_preferred_areas text[] DEFAULT NULL,
  p_farthest_travel text DEFAULT NULL,
  p_willing_farther boolean DEFAULT NULL,
  p_has_passport boolean DEFAULT NULL,
  p_overseas_willing boolean DEFAULT NULL,
  p_departure_readiness text DEFAULT NULL,
  p_call_response_time text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_referred_crew text DEFAULT NULL,
  p_has_own_business boolean DEFAULT NULL,
  p_business_names text[] DEFAULT NULL,
  p_business_arrangement text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip inet;
BEGIN
  /* caller IP from PostgREST request headers (first hop of XFF chain) —
     recorded on the row as a fraud signal and rate-limited per minute */
  v_ip := COALESCE(
    NULLIF(trim(split_part(COALESCE(
      current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for',
      ''), ',', 1)), '')::inet,
    '0.0.0.0'::inet
  );

  INSERT INTO waitlist_rpc_hits (ip) VALUES (v_ip);
  DELETE FROM waitlist_rpc_hits WHERE ts < now() - interval '10 minutes';
  IF (SELECT count(*) FROM waitlist_rpc_hits WHERE ip = v_ip AND ts > now() - interval '1 minute') > 8 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = '54000';
  END IF;

  UPDATE waiting_list SET
    full_name            = p_full_name,
    phone                = p_phone,
    sms_consent          = sms_consent OR COALESCE(p_sms_consent, false),
    skills               = COALESCE(p_skills, '{}'),
    experience_years     = p_experience_years,
    travel_availability  = COALESCE(p_travel_availability, '{}'),
    union_affiliation    = p_union_affiliation,
    vehicles             = COALESCE(p_vehicles, '{}'),
    has_vehicle          = p_has_vehicle,
    day_rate_min         = p_day_rate_min,
    instagram_handle     = p_instagram_handle,
    company_name         = p_company_name,
    profile_completeness = GREATEST(profile_completeness, COALESCE(p_profile_completeness, 0)),
    companies_worked     = COALESCE(p_companies_worked, '[]'::jsonb),
    markets_worked       = COALESCE(p_markets_worked, '{}'),
    favorite_markets     = COALESCE(p_favorite_markets, '{}'),
    preferred_regions    = COALESCE(p_preferred_regions, '{}'),
    preferred_areas      = COALESCE(p_preferred_areas, '{}'),
    farthest_travel      = p_farthest_travel,
    willing_farther      = p_willing_farther,
    has_passport         = p_has_passport,
    overseas_willing     = p_overseas_willing,
    departure_readiness  = p_departure_readiness,
    call_response_time   = p_call_response_time,
    payment_type         = p_payment_type,
    referred_crew        = p_referred_crew,
    has_own_business     = p_has_own_business,
    business_names       = COALESCE(p_business_names, '{}'),
    business_arrangement = p_business_arrangement,
    signup_ip            = COALESCE(signup_ip, v_ip)
  WHERE email = lower(trim(p_email))
    AND full_name IS NULL
    AND created_at > now() - interval '30 minutes';
  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.waitlist_fill_crew_card(text,text,text,boolean,text[],text,text[],text,text[],boolean,integer,text,text,integer,jsonb,text[],text[],text[],text[],text,boolean,boolean,boolean,text,text,text,text,boolean,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.waitlist_fill_crew_card(text,text,text,boolean,text[],text,text[],text,text[],boolean,integer,text,text,integer,jsonb,text[],text[],text[],text[],text,boolean,boolean,boolean,text,text,text,text,boolean,text[],text) TO anon, authenticated;

/*
  # waitlist_sanitize_anon_insert — column-writability wall

  waiting_list's public INSERT policy is WITH CHECK (true) — RLS gates
  rows, not columns, so a direct PostgREST insert could set server-owned
  fields (status='verified', referral_count, verified_at, a chosen
  verification_token). Anything not coming through the service role gets
  those fields forced to safe pending defaults. The edge function path
  (service_role) is untouched.
*/
CREATE OR REPLACE FUNCTION public.waitlist_sanitize_anon_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
     IS DISTINCT FROM 'service_role' THEN
    NEW.status              := 'pending';
    NEW.verified_at         := NULL;
    NEW.verification_sent_at := NULL;
    NEW.referral_count      := 0;
    NEW.profile_completeness := 0;
    NEW.signup_ip           := NULL;
    NEW.created_at          := now();
    NEW.referral_code       := gen_random_uuid()::text;
    NEW.verification_token  := gen_random_uuid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitlist_sanitize_anon ON waiting_list;
CREATE TRIGGER trg_waitlist_sanitize_anon
  BEFORE INSERT ON waiting_list
  FOR EACH ROW
  EXECUTE FUNCTION public.waitlist_sanitize_anon_insert();

REVOKE ALL ON FUNCTION public.waitlist_sanitize_anon_insert() FROM PUBLIC;
