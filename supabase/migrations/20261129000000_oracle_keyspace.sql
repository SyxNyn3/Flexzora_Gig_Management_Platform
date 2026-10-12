-- Red-team #50 + #48.
--
-- #50 — worker_distances / worker_conflicts / worker_travel_conflicts took an
--        arbitrary worker_id[] and answered for ANY worker: distance output is
--        a home-location triangulation oracle (probe with shifted origins) and
--        conflict output is a cross-company availability oracle (verified).
--        Rows for workers the caller shares nothing with now return NULLs —
--        the result shape is preserved so matching UI doesn't break, but no
--        data leaks. "Shared" = self, an assignment on an event I own, or a
--        member of my preferred roster.
--
-- #48 — crew_alerts.dedupe_key was globally unique AND workers could
--        self-insert alerts: squatting 'alert:ride-cancelled:<victim's
--        request id>' on the attacker's own row suppressed the REAL briefing
--        for the victim (verified). The keyspace is now per-worker via an
--        INSERT trigger that prefixes worker_id, and the self-insert policy is
--        gone — alerts are written only by definer triggers/RPCs.

-- #50 ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shares_party(p_worker uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  -- callers with no client JWT (service role, tests, admin SQL) are exempt —
  -- current_user can't detect them here since this fn is SECURITY DEFINER
  SELECT auth.uid() IS NULL
    OR (p_worker IS NOT NULL AND (
    p_worker = current_profile_id()
    OR EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE a.worker_id = p_worker AND owns_company(e.company_id))
    OR EXISTS (
      SELECT 1 FROM preferred_rosters pr
      WHERE pr.worker_id = p_worker AND owns_company(pr.company_id))
    ));
$$;

CREATE OR REPLACE FUNCTION worker_distances(p_worker_ids uuid[], p_lat double precision, p_lng double precision)
RETURNS TABLE (worker_id uuid, distance_km double precision)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws.worker_id,
         CASE WHEN NOT shares_party(ws.worker_id) OR ws.geo IS NULL THEN NULL
              ELSE ST_Distance(ws.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0 END
  FROM worker_sensitive ws
  WHERE ws.worker_id = ANY(p_worker_ids)
$$;

CREATE OR REPLACE FUNCTION worker_conflicts(
  p_worker_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_buffer_minutes integer DEFAULT 60
) RETURNS TABLE (worker_id uuid, hard_conflict boolean, buffer_conflict boolean)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT w.id,
         CASE WHEN shares_party(w.id) THEN EXISTS (
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
    ) ELSE NULL END,
         CASE WHEN shares_party(w.id) THEN EXISTS (
      SELECT 1 FROM shift_assignments a
      JOIN shifts s ON s.id = a.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE a.worker_id = w.id AND a.status = 'confirmed'
        AND s.status <> 'cancelled' AND e.status <> 'cancelled'
        AND s.starts_at < p_end + make_interval(mins => p_buffer_minutes)
        AND s.ends_at > p_start - make_interval(mins => p_buffer_minutes)
    ) ELSE NULL END
  FROM unnest(p_worker_ids) AS w(id)
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
         CASE WHEN shares_party(w.id) THEN (
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
    )) ELSE NULL END,
         CASE WHEN shares_party(w.id) THEN (
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
    )) ELSE NULL END,
         CASE WHEN shares_party(w.id) THEN EXISTS (
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
    ) ELSE NULL END
  FROM unnest(p_worker_ids) AS w(id)
$$;

-- #48 ------------------------------------------------------------------------
-- Per-worker keyspace WITHOUT touching the eight existing functions: every
-- stored dedupe_key is prefixed with the alert's worker_id by a BEFORE INSERT
-- trigger. ON CONFLICT (dedupe_key) arbiters keep working (they compare the
-- rewritten stored value), the global unique index stays, and any future
-- self-insert path can only ever squat inside the attacker's OWN keyspace —
-- never suppress another worker's briefing.
CREATE OR REPLACE FUNCTION crew_alerts_keyspace() RETURNS trigger AS $$
BEGIN
  IF NEW.dedupe_key IS NOT NULL AND NEW.worker_id IS NOT NULL
     AND NEW.dedupe_key NOT LIKE NEW.worker_id::text || ':%' THEN
    NEW.dedupe_key := NEW.worker_id::text || ':' || NEW.dedupe_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crew_alerts_keyspace ON crew_alerts;
CREATE TRIGGER crew_alerts_keyspace BEFORE INSERT ON crew_alerts
  FOR EACH ROW EXECUTE FUNCTION crew_alerts_keyspace();

-- alerts are system-written (triggers + definer RPCs); workers never insert
DROP POLICY IF EXISTS "crew_alerts insert self" ON crew_alerts;
