-- Crew OS deeper: recurring ride buddies.
--
-- Matched ride history already records who drove whom. Two additions make it
-- useful: a 'ride_buddy' briefing kind emitted on confirm when a past co-rider
-- is also confirmed on the new call, and worker_ride_buddies()/my_last_ride_offer()
-- RPCs so the board can show "same car as last time?" with one-tap join and a
-- pre-filled offer form for drivers.

ALTER TYPE crew_alert_kind ADD VALUE IF NOT EXISTS 'ride_buddy';

-- Caller-scoped: pairs the caller has matched with before, annotated with
-- whether the buddy is confirmed on p_shift_id and their open offer there.
CREATE OR REPLACE FUNCTION worker_ride_buddies(p_shift_id uuid)
RETURNS TABLE (
  buddy_worker_id uuid,
  buddy_name      text,
  rides_together  bigint,
  i_drove_last    boolean,
  last_ride_at    timestamptz,
  buddy_confirmed boolean,
  buddy_offer_id  uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := current_profile_id();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH history AS (
    -- I rode; they drove
    SELECT o.driver_worker_id AS buddy_id, false AS i_drove, s.starts_at
    FROM ride_requests r
    JOIN ride_offers o ON o.id = r.offer_id
    JOIN shifts s ON s.id = o.shift_id
    WHERE r.rider_worker_id = v_me AND r.status = 'matched'
    UNION ALL
    -- I drove; they rode
    SELECT r.rider_worker_id, true, s.starts_at
    FROM ride_requests r
    JOIN ride_offers o ON o.id = r.offer_id
    JOIN shifts s ON s.id = o.shift_id
    WHERE o.driver_worker_id = v_me AND r.status = 'matched'
  ),
  per_buddy AS (
    SELECT h.buddy_id,
           count(*)::bigint AS rides,
           (array_agg(h.i_drove ORDER BY h.starts_at DESC))[1] AS drove_last,
           max(h.starts_at) AS last_at
    FROM history h
    WHERE h.buddy_id IS NOT NULL
    GROUP BY h.buddy_id
  )
  SELECT pb.buddy_id,
         p.full_name,
         pb.rides,
         pb.drove_last,
         pb.last_at,
         EXISTS (
           SELECT 1 FROM shift_assignments sa
           WHERE sa.shift_id = p_shift_id AND sa.worker_id = pb.buddy_id AND sa.status = 'confirmed'
         ),
         (SELECT o.id FROM ride_offers o
          WHERE o.shift_id = p_shift_id AND o.driver_worker_id = pb.buddy_id AND o.status = 'open'
          LIMIT 1)
  FROM per_buddy pb
  JOIN profiles p ON p.id = pb.buddy_id
  ORDER BY pb.rides DESC, pb.last_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION worker_ride_buddies(uuid) TO authenticated;

-- Driver-side pre-fill: parameters of my most recent live offer.
CREATE OR REPLACE FUNCTION my_last_ride_offer()
RETURNS TABLE (seats integer, departure_area text, gas_share_cents integer, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.seats, o.departure_area, o.gas_share_cents, o.notes
  FROM ride_offers o
  WHERE o.driver_worker_id = current_profile_id() AND o.status <> 'cancelled'
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION my_last_ride_offer() TO authenticated;

-- Recreate the briefing generator with a ride-buddy pass appended.
CREATE OR REPLACE FUNCTION generate_shift_briefing(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  a shift_assignments%ROWTYPE;
  s shifts%ROWTYPE;
  v venues%ROWTYPE;
  gear text;
  distance_m double precision;
  drive_minutes integer;
  leave_by timestamptz;
  buddy record;
  v_my_name text;
  v_buddy_assignment uuid;
BEGIN
  SELECT * INTO a FROM shift_assignments WHERE id = p_assignment_id;
  IF NOT FOUND OR a.status <> 'confirmed' THEN
    RETURN;
  END IF;

  SELECT * INTO s FROM shifts WHERE id = a.shift_id;
  SELECT * INTO v FROM venues WHERE id = (SELECT venue_id FROM events WHERE id = s.event_id);

  -- Gear checklist: base items + cert-derived items, deduped.
  SELECT string_agg(item, E'\n  • ') INTO gear
  FROM (
    SELECT DISTINCT item
    FROM (
      SELECT item FROM base_gear_items
      UNION
      SELECT g.item FROM cert_gear_items g
      WHERE g.cert_code = ANY (s.required_cert_codes)
    ) all_items
    ORDER BY item
  ) dedup;

  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
  VALUES (
    a.worker_id, a.shift_id, 'gear',
    'Gear check — ' || s.title,
    'Pack for this call:' || E'\n  • ' || coalesce(gear, 'All-black work clothes'),
    a.id,
    'briefing:gear:' || a.id::text
  ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  -- Parking intel: anything the venue knows about where to put a vehicle.
  IF v.id IS NOT NULL AND (v.overnight_parking OR v.camping_allowed OR v.parking_notes IS NOT NULL OR v.parking_json <> '{}'::jsonb) THEN
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES (
      a.worker_id, a.shift_id, 'parking',
      'Parking at ' || v.name,
      concat_ws(E'\n',
        CASE WHEN v.overnight_parking THEN 'Overnight parking allowed' END,
        CASE WHEN v.camping_allowed THEN 'Camping allowed on site' END,
        v.parking_notes,
        NULLIF(v.parking_json ->> 'crew_lot', ''),
        NULLIF(v.parking_json ->> 'notes', '')
      ),
      a.id,
      'briefing:parking:' || a.id::text
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  -- Departure estimate: worker's private geo -> venue, 55 km/h + 20 min buffer.
  IF v.id IS NOT NULL AND v.geo IS NOT NULL THEN
    SELECT ST_Distance(ws.geo, v.geo) INTO distance_m
    FROM worker_sensitive ws
    WHERE ws.worker_id = a.worker_id AND ws.geo IS NOT NULL;

    IF distance_m IS NOT NULL THEN
      drive_minutes := ceil(distance_m / 1000.0 / 55.0 * 60);
      leave_by := s.starts_at - make_interval(mins => drive_minutes + 20);
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES (
        a.worker_id, a.shift_id, 'departure',
        'Leave by ' || to_char(leave_by AT TIME ZONE 'UTC', 'Dy HH24:MI') || ' UTC',
        format('%s km to %s — about %s min drive + 20 min buffer for %s call.',
          round(distance_m / 1000.0), v.name, drive_minutes, to_char(s.starts_at AT TIME ZONE 'UTC', 'HH24:MI')),
        a.id,
        'briefing:departure:' || a.id::text
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  -- Ride buddies: past co-riders confirmed on this call → "same car as last time?"
  FOR buddy IN
    SELECT b.buddy_id, p.full_name, count(*) AS rides,
           (array_agg(b.i_drove ORDER BY b.starts_at DESC))[1] AS i_drove
    FROM (
      SELECT o.driver_worker_id AS buddy_id, false AS i_drove, sh.starts_at
      FROM ride_requests r
      JOIN ride_offers o ON o.id = r.offer_id
      JOIN shifts sh ON sh.id = o.shift_id
      WHERE r.rider_worker_id = a.worker_id AND r.status = 'matched'
      UNION ALL
      SELECT r.rider_worker_id, true, sh.starts_at
      FROM ride_requests r
      JOIN ride_offers o ON o.id = r.offer_id
      JOIN shifts sh ON sh.id = o.shift_id
      WHERE o.driver_worker_id = a.worker_id AND r.status = 'matched'
    ) b
    JOIN profiles p ON p.id = b.buddy_id
    WHERE EXISTS (
      SELECT 1 FROM shift_assignments sa
      WHERE sa.shift_id = a.shift_id AND sa.worker_id = b.buddy_id AND sa.status = 'confirmed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM ride_requests r2 JOIN ride_offers o2 ON o2.id = r2.offer_id
      WHERE o2.shift_id = a.shift_id AND r2.status = 'matched'
        AND ((r2.rider_worker_id = a.worker_id AND o2.driver_worker_id = b.buddy_id)
          OR (r2.rider_worker_id = b.buddy_id AND o2.driver_worker_id = a.worker_id))
    )
    GROUP BY b.buddy_id, p.full_name
  LOOP
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    VALUES (
      a.worker_id, a.shift_id, 'ride_buddy',
      'Same car as last time?',
      format('%s %s %s — they''re on this call too.',
        buddy.full_name,
        CASE WHEN buddy.i_drove THEN 'rode with you' ELSE 'drove you' END,
        CASE WHEN buddy.rides = 1 THEN 'once' ELSE buddy.rides || ' times' END),
      buddy.buddy_id,
      'briefing:ridebuddy:' || a.id::text || ':' || buddy.buddy_id::text
    ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    -- Mirror to the buddy: they confirmed first, so nothing alerts them otherwise.
    SELECT sa.id, p.full_name INTO v_buddy_assignment, v_my_name
    FROM shift_assignments sa, profiles p
    WHERE sa.shift_id = a.shift_id AND sa.worker_id = buddy.buddy_id AND sa.status = 'confirmed'
      AND p.id = a.worker_id
    LIMIT 1;
    IF v_buddy_assignment IS NOT NULL THEN
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES (
        buddy.buddy_id, a.shift_id, 'ride_buddy',
        'Same car as last time?',
        format('%s %s %s — they''re on this call too.',
          v_my_name,
          CASE WHEN buddy.i_drove THEN 'drove you' ELSE 'rode with you' END,
          CASE WHEN buddy.rides = 1 THEN 'once' ELSE buddy.rides || ' times' END),
        a.worker_id,
        'briefing:ridebuddy:' || v_buddy_assignment::text || ':' || a.worker_id::text
      ) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
