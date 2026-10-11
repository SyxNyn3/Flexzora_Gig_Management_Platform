-- Travel-time feasibility for smart matching.
--
-- The flat turnaround buffer treated a worker booked across the street the
-- same as one booked three hours away. worker_travel_conflicts measures the
-- actual gap between each adjacent confirmed booking's venue and the
-- candidate venue (Haversine × blended road speed + turnaround floor) and
-- reports whether the hop is infeasible (gap < travel), tight (inside travel
-- + 1h slack), or clear — without exposing which competitor holds the other
-- booking. A routing-matrix provider can replace travel_minutes later; the
-- RPC boundary is the seam.

CREATE OR REPLACE FUNCTION travel_minutes(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN NULL
    ELSE ceil(
      6371 * 2 * asin(sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2)
        + cos(radians(p_lat1)) * cos(radians(p_lat2))
        * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
      )) * 1.2          -- ~50 km/h blended road speed
    )::integer + 30     -- wrap/turnaround floor
  END
$$;

CREATE OR REPLACE FUNCTION worker_travel_conflicts(
  p_worker_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_venue_lat double precision DEFAULT NULL,
  p_venue_lng double precision DEFAULT NULL
) RETURNS TABLE (worker_id uuid, hard_conflict boolean, travel_infeasible boolean, travel_tight boolean)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT w.id,
    -- overlap with a confirmed booking (any company) or a declared block
    EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE a.worker_id = w.id AND a.status = 'confirmed'
        AND s.status <> 'cancelled' AND e.status <> 'cancelled'
        AND s.starts_at < p_end AND s.ends_at > p_start
    ) OR EXISTS (
      SELECT 1 FROM availability av
      WHERE av.worker_id = w.id AND av.is_available = false
        AND av.start_time < p_end AND av.end_time > p_start
    ),
    -- adjacent booking whose gap is shorter than the travel it demands
    p_venue_lat IS NOT NULL AND p_venue_lng IS NOT NULL AND EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      LEFT JOIN venues v ON v.id = e.venue_id
      WHERE a.worker_id = w.id AND a.status = 'confirmed'
        AND s.status <> 'cancelled' AND e.status <> 'cancelled'
        AND (
          (s.ends_at <= p_start AND extract(epoch from (p_start - s.ends_at)) / 60
             < COALESCE(travel_minutes(v.latitude, v.longitude, p_venue_lat, p_venue_lng), 60))
          OR
          (s.starts_at >= p_end AND extract(epoch from (s.starts_at - p_end)) / 60
             < COALESCE(travel_minutes(v.latitude, v.longitude, p_venue_lat, p_venue_lng), 60))
        )
    ),
    -- reachable but without slack: inside travel time + one hour
    EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      LEFT JOIN venues v ON v.id = e.venue_id
      WHERE a.worker_id = w.id AND a.status = 'confirmed'
        AND s.status <> 'cancelled' AND e.status <> 'cancelled'
        AND (
          (s.ends_at <= p_start AND extract(epoch from (p_start - s.ends_at)) / 60
             < COALESCE(travel_minutes(v.latitude, v.longitude, p_venue_lat, p_venue_lng), 60) + 60)
          OR
          (s.starts_at >= p_end AND extract(epoch from (s.starts_at - p_end)) / 60
             < COALESCE(travel_minutes(v.latitude, v.longitude, p_venue_lat, p_venue_lng), 60) + 60)
        )
    )
  FROM unnest(p_worker_ids) AS w(id)
  -- Availability-oracle guard (#50 class): API callers only see rows for
  -- workers related to a company they own (roster, assignment, or accepted
  -- application). Service/definer callers (matching sweeps, tests) are
  -- unfiltered. Non-related workers simply emit no row.
  WHERE current_user NOT IN ('authenticated', 'anon')
     OR EXISTS (
       SELECT 1 FROM companies c
       WHERE c.created_by = current_profile_id()
         AND worker_related_to_company(w.id, c.id))
$$;

GRANT EXECUTE ON FUNCTION travel_minutes(double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION worker_travel_conflicts(uuid[], timestamptz, timestamptz, double precision, double precision) TO authenticated;
