ALTER TABLE waiting_list
  ADD COLUMN IF NOT EXISTS market_city text,
  ADD COLUMN IF NOT EXISTS crew_roles text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company_type text,
  ADD COLUMN IF NOT EXISTS events_per_month integer,
  ADD COLUMN IF NOT EXISTS typical_crew_size integer,
  ADD COLUMN IF NOT EXISTS pain_points text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS beta_tester boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS heard_from text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_waiting_list_beta ON waiting_list (beta_tester) WHERE beta_tester;

CREATE OR REPLACE FUNCTION waitlist_public_stats() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'companies', count(*) FILTER (WHERE role_interest = 'company'),
    'workers', count(*) FILTER (WHERE role_interest = 'worker'),
    'beta_testers', count(*) FILTER (WHERE beta_tester))
  FROM waiting_list
$$;

GRANT EXECUTE ON FUNCTION waitlist_public_stats() TO anon, authenticated;

CREATE OR REPLACE FUNCTION waitlist_referral_status(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r waiting_list%ROWTYPE; v_ahead integer;
BEGIN
  SELECT * INTO r FROM waiting_list WHERE referral_code = p_code;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_ahead FROM waiting_list WHERE created_at < r.created_at;
  -- Only queue position and referral count are safe to expose via a bearer code.
  RETURN jsonb_build_object('referral_count', r.referral_count, 'position', GREATEST(v_ahead + 1 - 5 * r.referral_count, 1));
END $$;

GRANT EXECUTE ON FUNCTION waitlist_referral_status(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Admins can update waiting list entries" ON waiting_list;
DROP POLICY IF EXISTS "Admins can update waiting list entries" ON waiting_list;
CREATE POLICY "Admins can update waiting list entries" ON waiting_list FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'));
