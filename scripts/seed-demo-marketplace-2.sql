-- Demo marketplace seed #2: 8 more production companies for board fullness.
-- Same pattern as seed-demo-marketplace.sql: venue w/ real coords (geofence
-- works), published event, open+public shifts, is_demo = true throughout.
-- Idempotent: skips if '24-7 Productions' already exists.
-- Run in Supabase SQL editor or via scripts/ops tooling.

DO $$
DECLARE
  owner uuid := '30e3ac1f-0901-49ba-b044-eb8f1cb03579'; -- demo-company@flexzora.dev
  c247 uuid; ws uuid; rl uuid; c1 uuid; fw uuid; jt uuid; gg uuid; gl uuid;
  v247 uuid; vws uuid; vrl uuid; vc1 uuid; vfw uuid; vjt uuid; vgg uuid; vgl uuid;
  e247 uuid; ews uuid; erl uuid; ec1 uuid; efw uuid; ejt uuid; egg uuid; egl uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE is_demo AND name = '24-7 Productions') THEN
    RAISE NOTICE 'seed #2 already applied — skipping';
    RETURN;
  END IF;

  -- ── Companies ────────────────────────────────────────────────────────────
  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('24-7 Productions', 'Around-the-clock corporate AV and special-event production on the Strip corridor.', 'https://247prods.example.com', 'dispatch@247prods.example.com', '+1 702 555 0121', owner, true)
  RETURNING id INTO c247;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('William Signal', 'Broadcast and live-stream production for arena events and esports.', 'https://williamsignal.example.com', 'crew@williamsignal.example.com', '+1 704 555 0176', owner, true)
  RETURNING id INTO ws;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Rock Labor', 'High-volume stagehand labor provider — amphitheaters and arena pushes.', 'https://rocklabor.example.com', 'calls@rocklabor.example.com', '+1 303 555 0142', owner, true)
  RETURNING id INTO rl;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Crew One Productions', 'Regional crewing for concerts and festivals across the Mid-South.', 'https://crewone.example.com', 'staffing@crewone.example.com', '+1 901 555 0119', owner, true)
  RETURNING id INTO c1;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('4Wall Entertainment', 'Lighting and video rental house with full-service prep and install crews.', 'https://4wall.example.com', 'hire@4wall.example.com', '+1 702 555 0198', owner, true)
  RETURNING id INTO fw;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('JThor Productions', 'Chicago-area concert and theater production services.', 'https://jthor.example.com', 'work@jthor.example.com', '+1 312 555 0157', owner, true)
  RETURNING id INTO jt;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Gig Guys Production', 'Texas crew network — rodeos, festivals, and corporate activations.', 'https://gigguys.example.com', 'ops@gigguys.example.com', '+1 713 555 0163', owner, true)
  RETURNING id INTO gg;

  INSERT INTO companies (name, description, website_url, contact_email, contact_phone, created_by, is_demo)
  VALUES ('Gig Life', 'Miami nightlife and festival production — pool decks to stadium lots.', 'https://giglife.example.com', 'book@giglife.example.com', '+1 305 555 0133', owner, true)
  RETURNING id INTO gl;

  -- ── Venues (real coordinates) ────────────────────────────────────────────
  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (c247, 'Allegiant Stadium', '3333 Al Davis Way', 'Las Vegas', 'NV', 'US', 36.0908, -115.1834, 500, 'North service tunnel. Credential pickup at trailer B.', true)
  RETURNING id INTO v247;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (ws, 'Spectrum Center', '333 E Trade St', 'Charlotte', 'NC', 'US', 35.2251, -80.8392, 350, 'Loading dock off 5th St. Broadcast compound security check.', true)
  RETURNING id INTO vws;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (rl, 'Ball Arena', '1000 Chopper Cir', 'Denver', 'CO', 'US', 39.7487, -105.0077, 450, 'South dock. Hydrate — altitude day one.', true)
  RETURNING id INTO vrl;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (c1, 'FedExForum', '191 Beale St', 'Memphis', 'TN', 'US', 35.1382, -90.0505, 350, 'Dock off Dr. MLK Jr Ave. Steel toes required.', true)
  RETURNING id INTO vc1;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (fw, 'Las Vegas Convention Center — South Hall', '3150 Paradise Rd', 'Las Vegas', 'NV', 'US', 36.1215, -115.1520, 600, 'Hall S2 freight doors. Union hall check-in at marshal desk.', true)
  RETURNING id INTO vfw;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (jt, 'United Center', '1901 W Madison St', 'Chicago', 'IL', 'US', 41.8807, -87.6742, 450, 'Gate 5 dock. Hard hat zone during rigging calls.', true)
  RETURNING id INTO vjt;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (gg, 'Toyota Center', '1510 Polk St', 'Houston', 'TX', 'US', 29.7508, -95.3621, 400, 'La Branch St dock. Credential office across the skybridge.', true)
  RETURNING id INTO vgg;

  INSERT INTO venues (company_id, name, address, city, region, country, latitude, longitude, geofence_radius_m, load_in_notes, is_demo)
  VALUES (gl, 'Kaseya Center', '601 Biscayne Blvd', 'Miami', 'FL', 'US', 25.7814, -80.1870, 350, 'Bayfront dock — water-side gate. Sun gear for outdoor calls.', true)
  RETURNING id INTO vgl;

  -- ── Events (published) ───────────────────────────────────────────────────
  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (c247, v247, owner, 'Stadium Fight Night — Full Rig', 'concert', 'Broadcast fight night: follow spots, staging, LED ribbon, house rig support.', CURRENT_DATE + 9, CURRENT_DATE + 10, 'published', 'US_NV', 'America/Los_Angeles', true)
  RETURNING id INTO e247;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (ws, vws, owner, 'Esports Invitational — Broadcast Build', 'esports', 'Two-day esports invitational: camera platforms, fiber runs, IMAG, LED stage.', CURRENT_DATE + 14, CURRENT_DATE + 15, 'published', 'US_FLSA', 'America/New_York', true)
  RETURNING id INTO ews;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (rl, vrl, owner, 'Amphitheater Season Closer — Labor Call', 'concert', 'Season closer: morning push, show, overnight out — high headcount.', CURRENT_DATE + 16, CURRENT_DATE + 17, 'published', 'US_FLSA', 'America/Denver', true)
  RETURNING id INTO erl;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (c1, vc1, owner, 'Beale Street Touring Stop', 'concert', 'Arena tour stop: in, show, out with local crew support.', CURRENT_DATE + 13, CURRENT_DATE + 14, 'published', 'US_FLSA', 'America/Chicago', true)
  RETURNING id INTO ec1;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (fw, vfw, owner, 'Trade Show Expo — Hall Rig + Strike', 'corporate', 'Convention hall lighting/video package: prep, rig, strike across four days.', CURRENT_DATE + 21, CURRENT_DATE + 24, 'published', 'US_NV', 'America/Los_Angeles', true)
  RETURNING id INTO efw;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (jt, vjt, owner, 'United Center — Winter Tour Stop', 'concert', 'Arena stop: riggers, deck, IMAG support, same-night out.', CURRENT_DATE + 15, CURRENT_DATE + 16, 'published', 'US_FLSA', 'America/Chicago', true)
  RETURNING id INTO ejt;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (gg, vgg, owner, 'Rodeo Kickoff Concert — Build + Show', 'concert', 'Rodeo kickoff concert: stage deck, PA wings, follow spots, overnight out.', CURRENT_DATE + 12, CURRENT_DATE + 13, 'published', 'US_FLSA', 'America/Chicago', true)
  RETURNING id INTO egg;

  INSERT INTO events (company_id, venue_id, created_by, name, event_type, description, starts_on, ends_on, status, overtime_rule_code, timezone, is_demo)
  VALUES (gl, vgl, owner, 'Bayfront Festival — Main Stage', 'festival', 'Waterfront festival: main stage build, show cover, strike — heat plan in effect.', CURRENT_DATE + 17, CURRENT_DATE + 18, 'published', 'US_FLSA', 'America/New_York', true)
  RETURNING id INTO egl;

  -- ── Shifts (open + public) ───────────────────────────────────────────────
  -- 24-7 Productions — Vegas fight night
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e247, 'Follow Spot Operators', 'Follow Spot Operator', 4, (CURRENT_DATE + 10) + interval '15 hours', (CURRENT_DATE + 10) + interval '24 hours', 45, 'open', 'public', now(), 'Long-throw arena spots. Fight-night experience a plus.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e247, 'Stagehands — Ring + Stage Build', 'Stagehand', 10, (CURRENT_DATE + 9) + interval '7 hours', (CURRENT_DATE + 9) + interval '17 hours', 30, 'open', 'public', now(), 'Ring deck, stage apron, crowd barricade.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (e247, 'LED Ribbon Technician', 'LED Technician', 1, (CURRENT_DATE + 9) + interval '9 hours', (CURRENT_DATE + 9) + interval '19 hours', 52, 'open', 'public', now(), 'Ribbon board + jumbotron assist.', true);

  -- William Signal — Charlotte esports
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ews, 'Camera Utility / Cable', 'Camera Utility', 6, (CURRENT_DATE + 14) + interval '8 hours', (CURRENT_DATE + 14) + interval '18 hours', 34, 'open', 'public', now(), 'Fiber runs + camera assist. Broadcast day rate.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ews, 'Video Shader / V2', 'V2 Video Tech', 1, (CURRENT_DATE + 14) + interval '9 hours', (CURRENT_DATE + 15) + interval '1 hours', 55, 'open', 'public', now(), 'Shading 8 cameras, IMAG switcher assist.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ews, 'Stagehands — Set Build', 'Stagehand', 8, (CURRENT_DATE + 14) + interval '6 hours', (CURRENT_DATE + 14) + interval '14 hours', 27, 'open', 'public', now(), 'Broadcast set + LED stage deck.', true);

  -- Rock Labor — Denver amphitheater
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (erl, 'Stagehands — Push Crew', 'Stagehand', 16, (CURRENT_DATE + 16) + interval '6 hours', (CURRENT_DATE + 16) + interval '14 hours', 28, 'open', 'public', now(), 'Trucks to stage. Big call, dress for altitude sun.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (erl, 'Overnight Load-Out Crew', 'Stagehand', 16, (CURRENT_DATE + 17) + interval '0 hours', (CURRENT_DATE + 17) + interval '8 hours', 32, 'open', 'public', now(), 'Same-night out, OT after 8.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (erl, 'Forklift — Steel Deck', 'Forklift Operator', 2, (CURRENT_DATE + 16) + interval '7 hours', (CURRENT_DATE + 16) + interval '15 hours', 36, 'open', 'public', now(), 'Steel deck + steel bike rack. OSHA card required.', true);

  -- Crew One — Memphis tour stop
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ec1, 'Load-In — Trucks + Deck', 'Stagehand', 10, (CURRENT_DATE + 13) + interval '7 hours', (CURRENT_DATE + 13) + interval '15 hours', 26, 'open', 'public', now(), 'Four trucks, standard arena in.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ec1, 'Show Call — Deck Crew', 'Stagehand', 8, (CURRENT_DATE + 13) + interval '16 hours', (CURRENT_DATE + 14) + interval '2 hours', 30, 'open', 'public', now(), 'Deck cover + changeover support, then out.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ec1, 'Wardrobe / Steamer Assist', 'Wardrobe Assist', 1, (CURRENT_DATE + 13) + interval '10 hours', (CURRENT_DATE + 13) + interval '20 hours', 24, 'open', 'public', now(), 'Tour wardrobe support — steaming + quick changes.', true);

  -- 4Wall — Vegas trade show
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (efw, 'Lighting Techs — Booth Rig', 'Lighting Technician', 4, (CURRENT_DATE + 21) + interval '8 hours', (CURRENT_DATE + 21) + interval '18 hours', 40, 'open', 'public', now(), 'Convention booth rigs, truss motors.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (efw, 'Video Installers — LED Tile', 'LED Technician', 3, (CURRENT_DATE + 22) + interval '8 hours', (CURRENT_DATE + 22) + interval '18 hours', 46, 'open', 'public', now(), '2.6mm LED tile, NovaStar, build + QC.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (efw, 'Strike Crew — Hall Out', 'Stagehand', 12, (CURRENT_DATE + 24) + interval '16 hours', (CURRENT_DATE + 25) + interval '2 hours', 31, 'open', 'public', now(), 'Overnight strike, load trucks, sweep hall.', true);

  -- JThor — Chicago arena
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ejt, 'Arena Riggers (ETCP)', 'ETCP Arena Rigger', 4, (CURRENT_DATE + 15) + interval '6 hours', (CURRENT_DATE + 15) + interval '14 hours', 70, 'open', 'public', now(), 'Cert cards checked. Up-rig only.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ejt, 'Deck + Backline Push', 'Stagehand', 10, (CURRENT_DATE + 15) + interval '7 hours', (CURRENT_DATE + 15) + interval '15 hours', 29, 'open', 'public', now(), 'Deck build, backline staging, riser set.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (ejt, 'IMAG Video Assist', 'Video Assist', 1, (CURRENT_DATE + 15) + interval '14 hours', (CURRENT_DATE + 15) + interval '23 hours', 48, 'open', 'public', now(), 'Side-wall IMAG, camera shading assist.', true);

  -- Gig Guys — Houston rodeo kickoff
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (egg, 'Stage Deck + PA Wings', 'Stagehand', 8, (CURRENT_DATE + 12) + interval '6 hours', (CURRENT_DATE + 12) + interval '16 hours', 27, 'open', 'public', now(), 'Rodeo floor conversion, deck + wing stacks.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (egg, 'Follow Spot Operators', 'Follow Spot Operator', 2, (CURRENT_DATE + 13) + interval '16 hours', (CURRENT_DATE + 14) + interval '1 hours', 42, 'open', 'public', now(), 'House spots, concert set.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (egg, 'Overnight Out', 'Stagehand', 8, (CURRENT_DATE + 13) + interval '22 hours', (CURRENT_DATE + 14) + interval '7 hours', 30, 'open', 'public', now(), 'Out after show. Boots + gloves.', true);

  -- Gig Life — Miami bayfront fest
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (egl, 'Main Stage — Audio Assist', 'A2 Audio Tech', 1, (CURRENT_DATE + 17) + interval '9 hours', (CURRENT_DATE + 17) + interval '20 hours', 44, 'open', 'public', now(), 'Festival patch + RF assist.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (egl, 'Stagehands — Build + Cover', 'Stagehand', 10, (CURRENT_DATE + 17) + interval '7 hours', (CURRENT_DATE + 17) + interval '19 hours', 26, 'open', 'public', now(), 'Heat plan: shaded breaks + water mandatory.', true);
  INSERT INTO shifts (event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at, notes, is_demo)
  VALUES (egl, 'Strike — Overnight', 'Stagehand', 10, (CURRENT_DATE + 18) + interval '22 hours', (CURRENT_DATE + 19) + interval '7 hours', 29, 'open', 'public', now(), 'Overnight strike on the bayfront.', true);

  RAISE NOTICE 'seed #2 complete: 8 companies, 8 venues, 8 events, 24 shifts';
END $$;
