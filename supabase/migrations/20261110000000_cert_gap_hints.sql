-- "What unlocks more calls" — per-worker credential-gap hints.
--
-- The marketplace hides cert-gated shifts entirely (gatekeeperPassed filter),
-- so a worker missing a credential sees an empty feed with no explanation.
-- worker_cert_gaps counts how many of the shifts they'd OTHERWISE see
-- (same visibility rules as the marketplace) are locked behind each missing
-- credential — and distinguishes "never had it" from "pending review",
-- "rejected", and "expired" so the hint says the right thing.

CREATE OR REPLACE FUNCTION worker_cert_gaps(p_worker_id uuid)
RETURNS TABLE (cert_type_code text, cert_name text, demand_count bigint, state text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  WITH visible AS (
    -- the same pool the marketplace shows: open, future, roster-stage for
    -- the worker's companies or public for everyone, never blocked
    SELECT s.id, s.required_cert_codes, s.starts_at
    FROM shifts s
    JOIN events e ON e.id = s.event_id
    WHERE s.status = 'open'
      AND s.broadcast_stage IN ('roster', 'public')
      AND s.starts_at > now()
      AND NOT EXISTS (
        SELECT 1 FROM preferred_rosters pr
        WHERE pr.worker_id = p_worker_id AND pr.company_id = e.company_id AND pr.tier = 'blocked'
      )
      AND (
        s.broadcast_stage = 'public'
        OR EXISTS (
          SELECT 1 FROM preferred_rosters pr
          WHERE pr.worker_id = p_worker_id AND pr.company_id = e.company_id AND pr.tier <> 'blocked'
        )
      )
  ),
  required AS (
    SELECT req.code, v.starts_at
    FROM visible v, unnest(v.required_cert_codes) AS req(code)
  ),
  latest_cert AS (
    -- the worker's newest credential row per code decides the state label
    SELECT DISTINCT ON (c.cert_type_code)
      c.cert_type_code AS code, c.is_active, c.verified, c.expiration_date, c.verification_status
    FROM certifications c
    WHERE c.worker_id = p_worker_id
    ORDER BY c.cert_type_code, c.created_at DESC
  )
  SELECT req.code,
         COALESCE(ct.name, replace(req.code, '_', ' ')),
         count(*) AS demand_count,
         CASE
           WHEN lc.code IS NULL THEN 'missing'
           WHEN lc.is_active AND lc.verified THEN 'expired'
           WHEN lc.verification_status = 'pending' THEN 'pending'
           WHEN lc.verification_status = 'rejected' THEN 'rejected'
           WHEN lc.verification_status = 'none' THEN 'unsubmitted'
           ELSE 'expired'
         END AS state
  FROM required req
  LEFT JOIN certification_types ct ON ct.code = req.code
  LEFT JOIN latest_cert lc ON lc.code = req.code
  -- a cert clears the gate only if it's active + verified + not expired at
  -- that shift's start (mirrors worker_meets_shift_certs)
  WHERE NOT (
    lc.code IS NOT NULL AND lc.is_active AND lc.verified
    AND (lc.expiration_date IS NULL OR lc.expiration_date >= req.starts_at::date)
  )
  GROUP BY req.code, ct.name, state
  ORDER BY demand_count DESC, req.code
  LIMIT 5
$$;

-- Self only: the demand counts are harmless but the state field reveals cert
-- lifecycle details that belong to the worker. The parameterized form stays
-- ungranted so callers can only ever see their own gaps.
REVOKE ALL ON FUNCTION worker_cert_gaps(uuid) FROM authenticated, anon;

CREATE OR REPLACE FUNCTION worker_cert_gaps_for_current_user()
RETURNS TABLE (cert_type_code text, cert_name text, demand_count bigint, state text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT * FROM worker_cert_gaps(current_profile_id())
$$;

GRANT EXECUTE ON FUNCTION worker_cert_gaps_for_current_user() TO authenticated;
