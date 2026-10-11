-- Crew OS #6: SmartAlerts — per-shift briefing feed.
--
-- cert_gear_items: data-driven gear checklist per certification code.
-- crew_alerts:     the worker's in-app alert feed (push/email is a later,
--                  flag-gated transport on top of these rows).
--
-- When an assignment is confirmed, generate_shift_briefing() writes:
--   1. a gear alert — checklist derived from the shift's required certs
--   2. a parking alert — if the venue has overnight parking/camping/notes
--   3. a departure alert — great-circle distance worker->venue at 55 km/h
--      plus a 20-minute buffer, expressed as "leave by" relative to call time

-- ---------------------------------------------------------------------------
-- Gear checklist lookup (editable without redeploys)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cert_gear_items (
  cert_code text NOT NULL REFERENCES certification_types(code) ON DELETE CASCADE,
  item text NOT NULL,
  PRIMARY KEY (cert_code, item)
);

ALTER TABLE cert_gear_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cert_gear_items readable" ON cert_gear_items;
CREATE POLICY "cert_gear_items readable" ON cert_gear_items FOR SELECT TO authenticated USING (true);

INSERT INTO cert_gear_items (cert_code, item) VALUES
  ('OSHA_10',       'Hard hat'),
  ('OSHA_10',       'Hi-vis vest'),
  ('OSHA_10',       'Safety glasses'),
  ('OSHA_30',       'Hard hat'),
  ('OSHA_30',       'Hi-vis vest'),
  ('OSHA_30',       'Safety glasses'),
  ('OSHA_30',       'Steel-toe boots'),
  ('ETCP_ARENA',    'Climbing harness'),
  ('ETCP_ARENA',    'Rope access kit'),
  ('ETCP_ARENA',    'Carabiners + rigging hardware'),
  ('ETCP_ARENA',    'Work gloves'),
  ('ETCP_THEATRE',  'Climbing harness'),
  ('ETCP_THEATRE',  'Carabiners + rigging hardware'),
  ('ETCP_THEATRE',  'Work gloves'),
  ('ETCP_ELECTRIC', 'Insulated gloves'),
  ('ETCP_ELECTRIC', 'Multimeter'),
  ('ETCP_ELECTRIC', 'Headlamp'),
  ('FORKLIFT',      'Hi-vis vest'),
  ('FORKLIFT',      'Steel-toe boots'),
  ('AERIAL_LIFT',   'Fall-arrest harness'),
  ('AERIAL_LIFT',   'Lanyard'),
  ('AERIAL_LIFT',   'Hard hat'),
  ('CPR_FIRST_AID', 'Pocket mask'),
  ('FALL_PROTECT',  'Fall-arrest harness'),
  ('FALL_PROTECT',  'Lanyard'),
  ('FALL_PROTECT',  'Hard hat')
ON CONFLICT DO NOTHING;

-- Every crew call, regardless of certs:
CREATE TABLE IF NOT EXISTS base_gear_items (
  item text PRIMARY KEY
);

INSERT INTO base_gear_items (item) VALUES
  ('All-black work clothes'),
  ('Work gloves'),
  ('Boots'),
  ('Water bottle'),
  ('Headlamp'),
  ('Multi-tool')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "base_gear_items readable" ON base_gear_items;
ALTER TABLE base_gear_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "base_gear_items readable" ON base_gear_items FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Alert feed
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_alert_kind') THEN
    CREATE TYPE crew_alert_kind AS ENUM ('gear', 'parking', 'departure', 'pool', 'iou', 'custom');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crew_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE,
  kind crew_alert_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  ref_id uuid,           -- points at the thing the alert is about (post, order, …)
  dedupe_key text,       -- prevents re-writing the same briefing on re-confirm
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_alerts_worker_idx ON crew_alerts (worker_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS crew_alerts_dedupe_idx ON crew_alerts (dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE crew_alerts ENABLE ROW LEVEL SECURITY;

-- Workers read and mark-read their own feed. Inserts go through SECURITY
-- DEFINER generators (or self-insert for custom notes).
DROP POLICY IF EXISTS "crew_alerts select own" ON crew_alerts;
DROP POLICY IF EXISTS "crew_alerts update own" ON crew_alerts;
DROP POLICY IF EXISTS "crew_alerts insert self" ON crew_alerts;
CREATE POLICY "crew_alerts select own" ON crew_alerts FOR SELECT TO authenticated USING (worker_id = current_profile_id());
CREATE POLICY "crew_alerts update own" ON crew_alerts FOR UPDATE TO authenticated USING (worker_id = current_profile_id()) WITH CHECK (worker_id = current_profile_id());
CREATE POLICY "crew_alerts insert self" ON crew_alerts FOR INSERT TO authenticated WITH CHECK (worker_id = current_profile_id());
-- No delete: alerts expire by age, not deletion — keeps the audit trail.

-- ---------------------------------------------------------------------------
-- Briefing generator
-- ---------------------------------------------------------------------------

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
END;
$$;

-- Fire when an assignment lands in 'confirmed' (insert or transition).
CREATE OR REPLACE FUNCTION crew_briefing_on_confirm() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    PERFORM generate_shift_briefing(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crew_briefing_on_confirm ON shift_assignments;
CREATE TRIGGER crew_briefing_on_confirm AFTER INSERT OR UPDATE OF status ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION crew_briefing_on_confirm();

-- Pool/IOU-adjacent alerts land here too: tell a rider when their ride cancels.
CREATE OR REPLACE FUNCTION crew_alert_on_ride_cancel() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
    SELECT r.rider_worker_id, r.shift_id, 'pool',
      'Ride cancelled',
      'Your ride offer was cancelled — re-check the crew board for other rides.',
      r.id,
      'alert:ride-cancelled:' || r.id::text
    FROM ride_requests r
    WHERE r.offer_id = NEW.id AND r.status IN ('matched');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crew_alert_on_ride_cancel ON ride_offers;
CREATE TRIGGER crew_alert_on_ride_cancel AFTER UPDATE OF status ON ride_offers
  FOR EACH ROW EXECUTE FUNCTION crew_alert_on_ride_cancel();
