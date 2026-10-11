-- Crew OS deeper: pool suggestions by distance.
--
-- Ride offers, bunk pools, and food runs only carried free-text areas, so the
-- board couldn't say "this ride leaves near you" or "this is the closest bunk
-- to the venue". Optional geo pins fix that without forcing structure on
-- posters: pin once with "use my location", get distance-ranked suggestions.
--
-- Ranking (crew_pool_distances):
--   rides   → detour_km = home→pickup + pickup→venue − home→venue
--             (small detour = "passing your exit"); km = home→pickup
--   lodging → km = pool→venue ("closest bunk")
--   food    → km = pickup→venue
-- Unpinned rows return no distance and sort last client-side.

ALTER TABLE ride_offers   ADD COLUMN IF NOT EXISTS departure_lat double precision;
ALTER TABLE ride_offers   ADD COLUMN IF NOT EXISTS departure_lng double precision;
ALTER TABLE lodging_pools ADD COLUMN IF NOT EXISTS geo_lat double precision;
ALTER TABLE lodging_pools ADD COLUMN IF NOT EXISTS geo_lng double precision;
ALTER TABLE food_runs     ADD COLUMN IF NOT EXISTS pickup_lat double precision;
ALTER TABLE food_runs     ADD COLUMN IF NOT EXISTS pickup_lng double precision;

CREATE OR REPLACE FUNCTION crew_pool_distances(p_shift_id uuid)
RETURNS TABLE (
  kind      text,
  ref_id    uuid,
  km        numeric,   -- headline distance for the card badge
  detour_km numeric    -- rides only: extra km vs. driving straight to the venue
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := current_profile_id();
  v_home_lat double precision;
  v_home_lng double precision;
  v_venue_lat double precision;
  v_venue_lng double precision;
  v_direct double precision;
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;

  SELECT ws.latitude, ws.longitude INTO v_home_lat, v_home_lng
  FROM worker_sensitive ws WHERE ws.worker_id = v_me;

  SELECT vn.latitude, vn.longitude INTO v_venue_lat, v_venue_lng
  FROM shifts s
  JOIN events e ON e.id = s.event_id
  JOIN venues vn ON vn.id = e.venue_id
  WHERE s.id = p_shift_id;

  IF v_venue_lat IS NULL OR v_venue_lng IS NULL THEN RETURN; END IF;
  IF v_home_lat IS NOT NULL AND v_home_lng IS NOT NULL THEN
    v_direct := geo_km(v_home_lat, v_home_lng, v_venue_lat, v_venue_lng);
  END IF;

  RETURN QUERY
  -- ride detour (needs home geo); unpinned offers emit nothing
  SELECT 'ride', o.id,
         round(geo_km(v_home_lat, v_home_lng, o.departure_lat, o.departure_lng)::numeric, 1),
         round(GREATEST(
           geo_km(v_home_lat, v_home_lng, o.departure_lat, o.departure_lng)
           + geo_km(o.departure_lat, o.departure_lng, v_venue_lat, v_venue_lng)
           - v_direct, 0)::numeric, 1)
  FROM ride_offers o
  WHERE o.shift_id = p_shift_id AND o.status <> 'cancelled'
    AND o.departure_lat IS NOT NULL AND o.departure_lng IS NOT NULL
    AND v_home_lat IS NOT NULL
  UNION ALL
  -- closest bunk: pool→venue
  SELECT 'lodging', p.id,
         round(geo_km(p.geo_lat, p.geo_lng, v_venue_lat, v_venue_lng)::numeric, 1), NULL
  FROM lodging_pools p
  WHERE p.shift_id = p_shift_id AND p.status <> 'cancelled'
    AND p.geo_lat IS NOT NULL AND p.geo_lng IS NOT NULL
  UNION ALL
  -- food pickup→venue
  SELECT 'food', r.id,
         round(geo_km(r.pickup_lat, r.pickup_lng, v_venue_lat, v_venue_lng)::numeric, 1), NULL
  FROM food_runs r
  WHERE r.shift_id = p_shift_id AND r.status <> 'cancelled'
    AND r.pickup_lat IS NOT NULL AND r.pickup_lng IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION crew_pool_distances(uuid) TO authenticated;

-- Carry the departure pin too so "offer seats again" pre-fills fully.
CREATE OR REPLACE FUNCTION my_last_ride_offer()
RETURNS TABLE (seats integer, departure_area text, gas_share_cents integer, notes text,
               departure_lat double precision, departure_lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.seats, o.departure_area, o.gas_share_cents, o.notes, o.departure_lat, o.departure_lng
  FROM ride_offers o
  WHERE o.driver_worker_id = current_profile_id() AND o.status <> 'cancelled'
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;
