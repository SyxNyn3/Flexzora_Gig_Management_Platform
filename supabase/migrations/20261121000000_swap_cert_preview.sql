-- Crew OS deeper: cert-gated swap preview.
--
-- Swaps on cert-gated calls are invisible to workers who don't clear the
-- gate (RLS), so a near-miss sees nothing and never learns the swap existed.
-- my_locked_swaps returns a SAFE preview — swap id, sweetener, when it
-- posted, and the CALLER's missing credentials with their state — never the
-- requester's identity or anyone else's certs. Drives cert uploads.

CREATE OR REPLACE FUNCTION my_locked_swaps(p_shift_id uuid)
RETURNS TABLE (swap_id uuid, sweetener_cents integer, posted_at timestamptz, missing jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH s AS (
    SELECT required_cert_codes, starts_at FROM shifts WHERE id = p_shift_id
  ),
  lc AS (
    SELECT DISTINCT ON (c.cert_type_code)
      c.cert_type_code AS code, c.is_active, c.verified, c.expiration_date, c.verification_status
    FROM certifications c
    WHERE c.worker_id = current_profile_id()
    ORDER BY c.cert_type_code, c.created_at DESC
  )
  SELECT r.id, r.sweetener_cents, r.created_at,
    (SELECT jsonb_agg(jsonb_build_object(
        'code', req.code,
        'name', COALESCE(ct.name, replace(req.code, '_', ' ')),
        'state', CASE
          WHEN lc2.code IS NULL THEN 'missing'
          WHEN lc2.is_active AND lc2.verified THEN 'expired'
          WHEN lc2.verification_status = 'pending' THEN 'pending'
          WHEN lc2.verification_status = 'rejected' THEN 'rejected'
          WHEN lc2.verification_status = 'none' THEN 'unsubmitted'
          ELSE 'expired' END))
     FROM unnest(s.required_cert_codes) AS req(code)
     LEFT JOIN certification_types ct ON ct.code = req.code
     LEFT JOIN lc lc2 ON lc2.code = req.code
     -- a cert clears the gate only if active + verified + unexpired at the
     -- call's start (mirrors worker_meets_shift_certs)
     WHERE NOT (
       lc2.code IS NOT NULL AND lc2.is_active AND lc2.verified
       AND (lc2.expiration_date IS NULL OR lc2.expiration_date >= s.starts_at::date)))
  FROM swap_requests r, s
  WHERE r.shift_id = p_shift_id
    AND r.status = 'open'
    AND r.requester_worker_id <> current_profile_id()
    AND NOT worker_meets_shift_certs(current_profile_id(), p_shift_id)
$$;

GRANT EXECUTE ON FUNCTION my_locked_swaps(uuid) TO authenticated;
