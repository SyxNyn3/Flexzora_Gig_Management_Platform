-- Demo marketplace seed: realistic production companies + venues + published
-- events + open public shifts across 4 cities. All rows marked is_demo = true.
-- Real venue coordinates so GPS geofence clock-in works on these jobs.
-- Idempotent: skips if demo companies already exist.
-- Run in Supabase SQL editor or via scripts/ops tooling.

DO $$
DECLARE
  owner uuid := '30e3ac1f-0901-49ba-b044-eb8f1cb03579'; -- profiles.id for demo-company@flexzora.dev
  co_orlando uuid; co_tampa uuid; co_atlanta uuid; co_nash uuid;
  v_orlando uuid; v_tampa uuid; v_atlanta uuid; v_nash uuid;
  e_fest uuid; e_corp uuid; e_tour uuid; e_river uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE is_demo AND name = 'Sunset Stage Productions') THEN
    RAISE NOTICE 'demo seed already applied — skipping';
    RETURN;
  END IF;

  -- ── Companies ────────────────────────────────────────────────────────────
  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Sunset Stage Productions', 'Full-service event production — festivals and arena shows across the Southeast.', 'https://sunsetstage.example.com', 'crew@sunsetstage.example.com', '+1 407 555 0134', owner, true)
  RETURNING id INTO co_orlando;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Gulf Coast Event Services', 'Corporate summits and trade-show builds in the Tampa Bay area.', 'https://gulfcoastevents.example.com', 'ops@gulfcoastevents.example.com', '+1 813 555 0188', owner, true)
  RETURNING id INTO co_tampa;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Peach State Production Group', 'Arena touring support and large-scale staging, Atlanta-based.', 'https://peachstateprod.example.com', 'work@peachstateprod.example.com', '+1 404 555 0166', owner, true)
  RETURNING id INTO co_atlanta;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Riverbend Live', 'Outdoor concert series production along the Cumberland.', 'https://riverbendlive.example.com', 'hiring@riverbendlive.example.com', '+1 615 555 0147', owner, true)
  RETURNING id INTO co_nash;

  -- ── Venues (real coordinates → geofence works) ───────────────────────────
  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (co_orlando, 'Camping World Stadium', '1 Citrus Bowl Pl', 'Orlando', 'FL', 'US', 28.5389, -81.4028, 400, 'North dock, badges at gate 3. Steel toes required.', true)
  RETURNING id INTO v_orlando;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (co_tampa, 'Raymond James Stadium', '4201 N Dale Mabry Hwy', 'Tampa', 'FL', 'US', 27.9759, -82.5033, 500, 'Service road entrance, forklift staging at Lot D.', true)
  RETURNING id INTO v_tampa;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (co_atlanta, 'State Farm Arena', '1 State Farm Dr', 'Atlanta', 'GA', 'US', 33.7573, -84.3963, 350, 'Underground dock. Hard hat + hi-vis on the floor.', true)
  RETURNING id INTO v_atlanta;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (co_nash, 'Nissan Stadium', '1 Titans Way', 'Nashville', 'TN', 'US', 36.1665, -86.7713, 500, 'River gate check-in, parking shuttle from Lot R.', true)
  RETURNING id INTO v_nash;

  -- ── Events (published = visible) ─────────────────────────────────────────
  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (co_orlando, v_orlando, owner, 'Harvest Music Festival — Weekend Build', 'festival', 'Two-day outdoor festival: main stage + side stage, full audio/lighting/video package.', CURRENT_DATE + 11, CURRENT_DATE + 12, 'published', 'US_FLSA', 'America/New_York', true)
  RETURNING id INTO e_fest;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (co_tampa, v_tampa, owner, 'National Franchise Summit — Arena Rig', 'corporate', 'Corporate general session: flown PA, LED wall, staging build + rehearsal + show.', CURRENT_DATE + 7, CURRENT_DATE + 9, 'published', 'US_FLSA', 'America/New_York', true)
  RETURNING id INTO e_corp;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (co_atlanta, v_atlanta, owner, 'Arena Tour Stop — Load-In / Show / Out', 'concert', 'Single-day arena stop: morning load-in, evening show, overnight out.', CURRENT_DATE + 19, CURRENT_DATE + 20, 'published', 'US_FLSA', 'America/New_York', true)
  RETURNING id INTO e_tour;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (co_nash, v_nash, owner, 'Riverbend Concert Series — Finale', 'concert', 'Season finale outdoors: full production, evening show, same-night strike.', CURRENT_DATE + 18, CURRENT_DATE + 18, 'published', 'US_FLSA', 'America/Chicago', true)
  RETURNING id INTO e_river;

  -- ── Shifts (open + public broadcast = marketplace-visible) ───────────────
  -- Orlando festival
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_fest, 'Main Stage — A1 Audio Engineer', 'A1 Audio Engineer', 1, (CURRENT_DATE + 11) + interval '8 hours', (CURRENT_DATE + 11) + interval '18 hours', 58, 'open', 'public', now(), 'Digico SD7 package. Festival changeovers experience required.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_fest, 'Lighting — L2 on truss', 'L2 Lighting Tech', 2, (CURRENT_DATE + 11) + interval '7 hours', (CURRENT_DATE + 11) + interval '17 hours', 42, 'open', 'public', now(), 'Comfortable at height. Own harness preferred.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_fest, 'Stagehands — Load-In Crew', 'Stagehand', 8, (CURRENT_DATE + 10) + interval '6 hours', (CURRENT_DATE + 10) + interval '16 hours', 26, 'open', 'public', now(), 'Deck build + barrier + backline staging.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_fest, 'Rigger (ETCP Arena)', 'ETCP Arena Rigger', 2, (CURRENT_DATE + 10) + interval '8 hours', (CURRENT_DATE + 10) + interval '18 hours', 65, 'open', 'public', now(), 'Cert card checked at gate. Roof + delay towers.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_fest, 'Video Wall — V1', 'V1 Video Engineer', 1, (CURRENT_DATE + 11) + interval '9 hours', (CURRENT_DATE + 11) + interval '19 hours', 48, 'open', 'public', now(), 'LED wall + IMAG, Novastar processors.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_fest, 'Strike Crew — Overnight', 'Stagehand', 10, (CURRENT_DATE + 12) + interval '22 hours', (CURRENT_DATE + 13) + interval '6 hours', 28, 'open', 'public', now(), 'Overnight load-out. Steel toes, gloves.', true);

  -- Tampa corporate summit
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_corp, 'Lead Carpenter — Staging', 'Lead Carpenter', 1, (CURRENT_DATE + 7) + interval '7 hours', (CURRENT_DATE + 7) + interval '17 hours', 46, 'open', 'public', now(), 'Modular stage + risers + scenic flats.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_corp, 'Audio A2 — RF + patch', 'A2 Audio Tech', 1, (CURRENT_DATE + 7) + interval '8 hours', (CURRENT_DATE + 7) + interval '18 hours', 44, 'open', 'public', now(), 'RF coordination for 24 channels.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_corp, 'Stagehands — General Session Build', 'Stagehand', 6, (CURRENT_DATE + 7) + interval '7 hours', (CURRENT_DATE + 7) + interval '15 hours', 27, 'open', 'public', now(), 'Deck, drape, chairs, scenic.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_corp, 'Forklift Operator — Dock', 'Forklift Operator', 1, (CURRENT_DATE + 7) + interval '6 hours', (CURRENT_DATE + 7) + interval '14 hours', 33, 'open', 'public', now(), 'OSHA cert required. Dock + freight path.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_corp, 'Show Days — Floor PA/Runner', 'Production Assistant', 2, (CURRENT_DATE + 8) + interval '7 hours', (CURRENT_DATE + 8) + interval '17 hours', 20, 'open', 'public', now(), 'Comms, cues, greenroom turns.', true);

  -- Atlanta arena tour stop
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_tour, 'Stagehands — Push/Load-In', 'Stagehand', 12, (CURRENT_DATE + 19) + interval '6 hours', (CURRENT_DATE + 19) + interval '14 hours', 28, 'open', 'public', now(), 'Trucks to deck. Push experience a plus.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_tour, 'Arena Rigger', 'ETCP Arena Rigger', 3, (CURRENT_DATE + 19) + interval '7 hours', (CURRENT_DATE + 19) + interval '15 hours', 68, 'open', 'public', now(), 'Grid work, bridles, motors. Cert required.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_tour, 'Video Wall Tech', 'Video Wall Technician', 2, (CURRENT_DATE + 19) + interval '8 hours', (CURRENT_DATE + 19) + interval '16 hours', 50, 'open', 'public', now(), 'IMAG + side walls. Touring rig.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_tour, 'Overnight Out — Load-Out', 'Stagehand', 12, (CURRENT_DATE + 19) + interval '22 hours', (CURRENT_DATE + 20) + interval '6 hours', 30, 'open', 'public', now(), 'Same-night out. OT after 8.', true);

  -- Nashville riverside finale
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_river, 'Monitor Engineer', 'Monitor Engineer', 1, (CURRENT_DATE + 18) + interval '10 hours', (CURRENT_DATE + 18) + interval '22 hours', 60, 'open', 'public', now(), '6 mixes + wedges. Festival patch.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_river, 'FOH A2', 'A2 Audio Tech', 1, (CURRENT_DATE + 18) + interval '10 hours', (CURRENT_DATE + 18) + interval '22 hours', 46, 'open', 'public', now(), 'Assist FOH, run snake check.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_river, 'Stagehands — Build + Out', 'Stagehand', 6, (CURRENT_DATE + 18) + interval '8 hours', (CURRENT_DATE + 18) + interval '23 hours', 26, 'open', 'public', now(), 'Split shift: build, cover show, strike.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e_river, 'Merch + Vendor Setup', 'Production Assistant', 3, (CURRENT_DATE + 18) + interval '9 hours', (CURRENT_DATE + 18) + interval '15 hours', 22, 'open', 'public', now(), 'Vendor row setup, guest services support.', true);

  RAISE NOTICE 'demo seed complete: 4 companies, 4 venues, 4 events, 19 shifts';
END $$;
