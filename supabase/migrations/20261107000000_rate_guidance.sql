-- Rate guidance for the shift form.
--
-- "What does a Ground Rigger actually clear around here?" — percentiles built
-- from cleared rates (offered_rate when negotiated, else the call's posted
-- rate) on confirmed/completed assignments, filtered to the same role family
-- and a market radius around the event venue. Aggregate-only output: the RPC
-- never returns a row, so cross-company rate intel stays anonymous.

CREATE OR REPLACE FUNCTION geo_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
    * power(sin(radians(p_lng2 - p_lng1) / 2), 2)));
$$;

CREATE OR REPLACE FUNCTION rate_guidance(
  p_company_id uuid,
  p_role_name text DEFAULT NULL,
  p_skill_id uuid DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_km integer DEFAULT 150
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  RETURN (
    WITH rates AS (
      SELECT COALESCE(a.offered_rate, s.hourly_rate)::numeric AS rate
      FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      LEFT JOIN venues v ON v.id = e.venue_id
      WHERE a.status IN ('confirmed', 'completed')
        AND s.status NOT IN ('cancelled', 'draft')
        AND (
          (p_role_name IS NOT NULL AND btrim(p_role_name) <> ''
            AND lower(s.role_name) LIKE '%' || lower(btrim(p_role_name)) || '%')
          OR (p_skill_id IS NOT NULL AND s.skill_id = p_skill_id)
        )
        -- market filter: venue within radius; venue-less events only count in
        -- the unscoped pool (we can't place them on the map)
        AND (
          (p_lat IS NULL OR p_lng IS NULL)
          OR (v.latitude IS NOT NULL AND v.longitude IS NOT NULL
              AND geo_km(v.latitude, v.longitude, p_lat, p_lng) <= p_radius_km)
        )
    )
    SELECT jsonb_build_object(
      'count', count(*),
      'p25', percentile_cont(0.25) WITHIN GROUP (ORDER BY rate),
      'p50', percentile_cont(0.5)  WITHIN GROUP (ORDER BY rate),
      'p75', percentile_cont(0.75) WITHIN GROUP (ORDER BY rate)
    ) FROM rates
  );
END $$;

GRANT EXECUTE ON FUNCTION geo_km(double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION rate_guidance(uuid, text, uuid, double precision, double precision, integer) TO authenticated;
