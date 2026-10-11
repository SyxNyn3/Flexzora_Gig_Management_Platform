-- Demo seed: runs on `supabase db reset` (and `supabase start` on a clean volume).
-- Login for every demo account: password `Demo1234!`
--   demo-company@flexzora.dev  -> company owner (QA Productions)
--   demo-worker@flexzora.dev   -> worker, core roster
--   demo-worker2@flexzora.dev  -> worker, preferred roster
--
-- profiles are created by the handle_new_user trigger on auth.users insert,
-- honoring raw_user_meta_data.role.

create extension if not exists pgcrypto;

do $$
declare
  v_company_user uuid := '11111111-0000-4000-8000-000000000001';
  v_worker1 uuid := '11111111-0000-4000-8000-000000000002';
  v_worker2 uuid := '11111111-0000-4000-8000-000000000003';
  v_company uuid := '22222222-0000-4000-8000-000000000001';
  v_venue uuid := '22222222-0000-4000-8000-000000000002';
  v_event uuid := '22222222-0000-4000-8000-000000000003';
  v_shift_roster uuid := '33333333-0000-4000-8000-000000000001';
  v_shift_public uuid := '33333333-0000-4000-8000-000000000002';
  v_gig uuid := '44444444-0000-4000-8000-000000000001';
  p_company_user uuid;
  p_worker1 uuid;
  p_worker2 uuid;
  v_skill_rigging uuid;
  v_skill_audio uuid;
  v_skill_video uuid;
  v_skill_stagehand uuid;
begin

  -- ------------------------------------------------------------------
  -- Auth users (gotrue needs auth.users + auth.identities rows)
  -- ------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, reauthentication_token,
    phone, confirmation_sent_at
  )
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, crypt('Demo1234!', gen_salt('bf')), now(),
         jsonb_build_object('role', u.role, 'full_name', u.name),
         now(), now(),
         '', '', '',
         '', '', '',
         null, now()
  from (values
    (v_company_user, 'demo-company@flexzora.dev', 'company', 'Demo Company Owner'),
    (v_worker1,      'demo-worker@flexzora.dev',  'worker',  'Alex Moreno'),
    (v_worker2,      'demo-worker2@flexzora.dev', 'worker',  'Jordan Kim')
  ) as u(id, email, role, name)
  where not exists (select 1 from auth.users au where au.id = u.id);

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select u.id, u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email),
         'email', now(), now(), now()
  from auth.users u
  where u.id in (v_company_user, v_worker1, v_worker2)
    and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

  -- Resolve profile ids (profiles.id is its own uuid, linked via profiles.user_id)
  select id into p_company_user from profiles where user_id = v_company_user;
  select id into p_worker1 from profiles where user_id = v_worker1;
  select id into p_worker2 from profiles where user_id = v_worker2;

  if p_company_user is null or p_worker1 is null or p_worker2 is null then
    raise exception 'profiles not created by handle_new_user trigger';
  end if;

  -- Profile enrichment (trigger already created the rows)
  update profiles set
    hourly_rate = 0, phone = '+1 415 555 0100', location = 'San Francisco, CA',
    is_available = true
  where id = p_company_user;

  update profiles set
    hourly_rate = 52, experience_years = 8, location = 'Oakland, CA',
    phone = '+1 415 555 0101', is_available = true,
    average_rating = 4.8, review_count = 31
  where id = p_worker1;

  update profiles set
    hourly_rate = 46, experience_years = 4, location = 'San Jose, CA',
    phone = '+1 415 555 0102', is_available = true,
    average_rating = 4.6, review_count = 12
  where id = p_worker2;

  -- ------------------------------------------------------------------
  -- Company + venue
  -- ------------------------------------------------------------------
  insert into companies (id, name, description, contact_email, contact_phone, created_by)
  values (v_company, 'Demo Productions',
          'Demo production company for the click-through build.',
          'demo-company@flexzora.dev', '+1 415 555 0100', p_company_user)
  on conflict (id) do nothing;

  insert into venues (id, company_id, name, address, city, region, latitude, longitude, load_in_notes)
  values (v_venue, v_company, 'Demo Stadium', '1 Stadium Way', 'San Francisco', 'CA',
          37.7749, -122.4194, 'Dock B — 30 min truck queue; marshal at Gate 4.')
  on conflict (id) do nothing;

  -- ------------------------------------------------------------------
  -- Skills + worker skills + certifications
  -- ------------------------------------------------------------------
  insert into skills (name, category, description) values
    ('Rigging', 'rigging', 'Arena/theatre rigging, motor points, truss'),
    ('FOH Mixing', 'audio', 'Front-of-house console operation'),
    ('LED Wall / Video', 'video', 'LED processors, walls, camera shading'),
    ('Stagehand', 'general', 'Deck crew, load-in/out, cable runs')
  on conflict (name) do nothing;

  select id into v_skill_rigging from skills where name = 'Rigging';
  select id into v_skill_audio from skills where name = 'FOH Mixing';
  select id into v_skill_video from skills where name = 'LED Wall / Video';
  select id into v_skill_stagehand from skills where name = 'Stagehand';

  insert into worker_skills (worker_id, skill_id, proficiency_level, years_experience) values
    (p_worker1, v_skill_rigging, 5, 8),
    (p_worker1, v_skill_audio, 4, 6),
    (p_worker2, v_skill_video, 4, 4),
    (p_worker2, v_skill_stagehand, 3, 4)
  on conflict (worker_id, skill_id) do nothing;

  insert into certifications (worker_id, name, issuing_organization, issue_date, cert_type_code, verified, is_active) values
    (p_worker1, 'ETCP Certified Rigger – Arena', 'ESTA', '2021-04-15', 'ETCP_ARENA', true, true),
    (p_worker1, 'OSHA 30-Hour General Industry', 'OSHA', '2019-06-01', 'OSHA_30', true, true),
    (p_worker2, 'OSHA 10-Hour General Industry', 'OSHA', '2022-03-10', 'OSHA_10', false, true)
  on conflict do nothing;

  -- ------------------------------------------------------------------
  -- Event + shifts (roster-first waterfall demo)
  -- ------------------------------------------------------------------
  insert into events (id, company_id, venue_id, created_by, name, event_type, description,
                      starts_on, ends_on, status)
  values (v_event, v_company, v_venue, p_company_user, 'Demo Festival — Main Stage',
          'concert', 'Click-through demo: load-in, show call, load-out.',
          current_date + 7, current_date + 9, 'published')
  on conflict (id) do nothing;

  -- Roster-stage: only roster members see it until the 24h window passes
  insert into shifts (id, event_id, title, role_name, skill_id, required_cert_codes, headcount,
                      starts_at, ends_at, hourly_rate, status, broadcast_stage, roster_broadcast_at)
  values (v_shift_roster, v_event, 'Load-in & rigging call', 'Ground Rigger', v_skill_rigging,
          '{ETCP_ARENA}'::text[], 4,
          current_date + 7 + interval '8 hours', current_date + 7 + interval '18 hours',
          52.00, 'open', 'roster', now())
  on conflict (id) do nothing;

  -- Public-stage: visible to every worker on the marketplace
  insert into shifts (id, event_id, title, role_name, skill_id, headcount,
                      starts_at, ends_at, hourly_rate, status, broadcast_stage, public_broadcast_at)
  values (v_shift_public, v_event, 'Show call / deck crew', 'Stagehand', v_skill_stagehand, 6,
          current_date + 8 + interval '16 hours', current_date + 9 + interval '1 hours',
          44.00, 'open', 'public', now())
  on conflict (id) do nothing;

  insert into preferred_rosters (company_id, worker_id, tier, notes, added_by) values
    (v_company, p_worker1, 'core', 'First call for rigging work.', p_company_user),
    (v_company, p_worker2, 'preferred', null, p_company_user)
  on conflict (company_id, worker_id) do nothing;

  -- ------------------------------------------------------------------
  -- Legacy gig + accepted application (worker dashboards/schedule)
  -- ------------------------------------------------------------------
  insert into gigs (id, title, description, company_id, created_by, location,
                    start_date, end_date, hourly_rate, required_workers,
                    skills_required, is_remote, status)
  values (v_gig, 'Demo Stadium Load-In — Rigging Call',
          'Truss, motors and cable run for the demo festival main stage. ETCP Arena Rigging cert preferred.',
          v_company, p_company_user, 'Demo Stadium, San Francisco, CA',
          current_date + 16, current_date + 17, 52.00, 4,
          '{Rigging,"Motor Points"}'::text[], false, 'published')
  on conflict (id) do nothing;

  insert into gig_applications (gig_id, worker_id, status, cover_letter, proposed_rate)
  values (v_gig, p_worker1, 'accepted', 'Core roster — happy to take the call.', 52.00)
  on conflict do nothing;

  insert into gig_applications (gig_id, worker_id, status, cover_letter, proposed_rate)
  values (v_gig, p_worker2, 'pending', 'Available both days.', 46.00)
  on conflict do nothing;

  insert into gig_messages (gig_id, sender_id, message_type, title, content, priority)
  values (v_gig, p_company_user, 'logistics', 'Call details — Dock B',
          'Dock B check-in 07:30. All blacks + steel toes; bring your own harness and glove kit. Lunch provided.',
          'high')
  on conflict do nothing;

  -- ------------------------------------------------------------------
  -- Company OS demo: a finished roster-contacts import in the history —
  -- Alex matched her account and imported; "Sam Rivera" (no Flexzora
  -- account) came back as a fixable error row.
  -- ------------------------------------------------------------------
  insert into import_jobs (id, company_id, created_by, target, file_name, file_type,
                         status, source_columns, mapping, mapping_source, stats, committed_at)
  values ('66666666-0000-4000-8000-000000000001', v_company, p_company_user, 'roster_contacts',
          'crew-roster-fall.csv', 'csv', 'committed',
          '{Name,Email,Phone,Tier}'::text[],
          '{"full_name":"Name","email":"Email","phone":"Phone","tier":"Tier"}'::jsonb,
          'heuristic',
          '{"total":2,"imported":1,"error":1}'::jsonb,
          now() - interval '2 days')
  on conflict (id) do nothing;

  insert into import_rows (job_id, row_index, raw, mapped, status, message, entity_id)
  values
    ('66666666-0000-4000-8000-000000000001', 0,
     '{"Name":"Alex Moreno","Email":"demo-worker@flexzora.dev","Phone":"+1 415 555 0101","Tier":"core"}'::jsonb,
     '{"full_name":"Alex Moreno","email":"demo-worker@flexzora.dev","phone":"+1 415 555 0101","tier":"core"}'::jsonb,
     'imported', 'imported', null),
    ('66666666-0000-4000-8000-000000000001', 1,
     '{"Name":"Sam Rivera","Email":"sam.rivera@example.com","Phone":"+1 415 555 0199","Tier":"preferred"}'::jsonb,
     '{"full_name":"Sam Rivera","email":"sam.rivera@example.com","phone":"+1 415 555 0199","tier":"preferred"}'::jsonb,
     'error', 'No Flexzora worker account for sam.rivera@example.com — invite them first (or import as staff)', null)
  on conflict (job_id, row_index) do nothing;

  -- ------------------------------------------------------------------
  -- Company OS demo: copilot knowledge notes — the kind of operating
  -- knowledge that lives in a manager's head or a shared drive.
  -- ------------------------------------------------------------------
  insert into company_docs (id, company_id, created_by, title, body, tags)
  values
    ('77777777-0000-4000-8000-000000000001', v_company, p_company_user,
     'IATSE-style overtime rules',
     'Crew on union-adjacent calls: OT at 1.5x after 8 hours, double-time after 12. 5-hour minimum call for stagehands; meal penalty kicks in if no break by hour 6.',
     '{union,overtime,rates}'),
    ('77777777-0000-4000-8000-000000000002', v_company, p_company_user,
     'Warehouse 9 load-in notes',
     'Dock is shared with the brewery next door — no trucks before 7am. Freight elevator maxes at 2,500 lbs; send the truss through the bay door instead. Ask for Marcus at the dock.',
     '{venue,load-in,warehouse}'),
    ('77777777-0000-4000-8000-000000000003', v_company, p_company_user,
     'Rate card — core crew',
     'A1 $65/hr, A2 $52/hr, master electrician $58/hr, general stagehand $38/hr. Core roster gets first refusal on weekend calls.',
     '{rates,crew}')
  on conflict (id) do nothing;


  -- ------------------------------------------------------------------
  -- Company OS demo: staff layer — internal team + event assignments.
  -- ------------------------------------------------------------------
  insert into staff_members (id, company_id, full_name, email, phone, title,
                             department, employment_type, day_rate, notes)
  values
    ('88888888-0000-4000-8000-000000000001', v_company, 'Dana Whitfield',
     'dana@demoproductions.example', '+1 415 555 0110', 'Production Manager',
     'Production', 'salaried', null, 'Runs all arena shows; first call for anything that moves.'),
    ('88888888-0000-4000-8000-000000000002', v_company, 'Priya Nair',
     'priya@demoproductions.example', '+1 415 555 0111', 'Site Coordinator',
     'Ops', 'day_rate', 450.00, 'Owns vendor access + credentials at the gate.'),
    ('88888888-0000-4000-8000-000000000003', v_company, 'Marcus Bell',
     'marcus@demoproductions.example', '+1 415 555 0112', 'Crew Lead',
     'Production', 'day_rate', 400.00, null)
  on conflict (id) do nothing;

  insert into staff_assignments (id, company_id, staff_id, event_id, role_label, call_time, status)
  values
    ('88888888-0000-4000-8000-000000000011', v_company, '88888888-0000-4000-8000-000000000001',
     v_event, 'PM', current_date + 7 + interval '7 hours', 'confirmed'),
    ('88888888-0000-4000-8000-000000000012', v_company, '88888888-0000-4000-8000-000000000002',
     v_event, 'Site lead', current_date + 7 + interval '7 hours', 'assigned')
  on conflict (id) do nothing;

  -- ------------------------------------------------------------------
  -- Company OS demo: a sent broadcast with its delivery log — two roster
  -- workers reached in-app, one accountless staff member queued for email.
  -- ------------------------------------------------------------------
  insert into broadcasts (id, company_id, created_by, subject, body, audience,
                          event_id, include_staff, status, recipient_count, sent_at)
  values ('99999999-0000-4000-8000-000000000001', v_company, p_company_user,
          'Load-in call time moved',
          'Load-in for Demo Festival moves to 7am tomorrow — dock door 3, see Marcus at the gate.',
          'event', v_event, true, 'sent', 3, now() - interval '1 day')
  on conflict (id) do nothing;

  insert into broadcast_recipients (broadcast_id, company_id, worker_id, channel, status)
  values
    ('99999999-0000-4000-8000-000000000001', v_company, p_worker1, 'in_app', 'sent'),
    ('99999999-0000-4000-8000-000000000001', v_company, p_worker2, 'in_app', 'sent')
  on conflict do nothing;

  insert into broadcast_recipients (broadcast_id, company_id, staff_id, channel, status, error)
  values
    ('99999999-0000-4000-8000-000000000001', v_company, '88888888-0000-4000-8000-000000000001',
     'email', 'queued', 'email transport not wired yet')
  on conflict do nothing;

  -- ------------------------------------------------------------------
  -- Company OS demo: calendar feeds — whole-company plus the PM's feed.
  -- ------------------------------------------------------------------
  insert into calendar_feeds (id, company_id, token, scope, staff_id, label, created_by)
  values
    ('aaaaaaaa-0000-4000-8000-000000000001', v_company, 'aaaaaaaa-0000-4000-8000-00000000feed',
     'company', null, 'All shows', p_company_user),
    ('aaaaaaaa-0000-4000-8000-000000000002', v_company, 'aaaaaaaa-0000-4000-8000-00000000beef',
     'staff', '88888888-0000-4000-8000-000000000001', 'Dana — PM calendar', p_company_user)
  on conflict (id) do nothing;

  -- ------------------------------------------------------------------
  -- Company OS demo: ops board — a manual task in flight, one done.
  -- (Unfilled-call cards generate themselves on board load.)
  -- ------------------------------------------------------------------
  insert into ops_tasks (id, company_id, event_id, title, notes, column_key, priority,
                         source, assigned_staff_id, due_at, created_by, done_at)
  values
    ('bbbbbbbb-0000-4000-8000-000000000001', v_company, v_event,
     'Confirm dock access with venue', 'Ask Marcus for the Gate 4 marshal schedule.',
     'in_progress', 'high', 'manual', '88888888-0000-4000-8000-000000000002',
     current_date + 6 + interval '12 hours', p_company_user, null),
    ('bbbbbbbb-0000-4000-8000-000000000002', v_company, v_event,
     'Send load-in details to crew', null, 'done', 'normal', 'manual',
     '88888888-0000-4000-8000-000000000001', null, p_company_user, now() - interval '6 hours')
  -- Crew OS demo: Jordan posts a ride offer; Alex's matched request
  -- makes the sync trigger mint his gas-share IOU automatically.
  -- Jordan already settled a manual burrito-run debt to Alex.
  -- ------------------------------------------------------------------
  insert into ride_offers (id, shift_id, driver_worker_id, seats,
                           departure_area, departure_at, gas_share_cents, notes)
  values ('55555555-0000-4000-8000-000000000010', v_shift_public, p_worker2, 3,
          'Pensacola hotel lot', current_date + 8 + interval '14 hours', 2000,
          'Room for 3 + small gear. Leaving before soundcheck.')
  on conflict (id) do nothing;

  insert into ride_requests (id, shift_id, rider_worker_id, seats_needed,
                             pickup_area, status, offer_id)
  values ('55555555-0000-4000-8000-000000000011', v_shift_public, p_worker1, 1,
          'Hotel lobby', 'matched', '55555555-0000-4000-8000-000000000010')
  on conflict (id) do nothing;

  insert into crew_iou (id, worker_id, shift_id, kind, amount_cents,
                        beneficiary_worker_id, status, settle_via, settled_at, notes)
  values ('55555555-0000-4000-8000-000000000002', p_worker2, v_shift_public, 'food', 1200,
          p_worker1, 'settled', 'manual', now() - interval '1 day',
          'Burrito run — paid cash after load-in.')
  on conflict (id) do nothing;

  -- Alex hosts an Airbnb near the venue; Jordan takes a bunk — the sync
  -- trigger mints Jordan's lodging-share IOU automatically.
  insert into lodging_pools (id, shift_id, host_worker_id, kind, name,
                             address_area, check_in_at, check_out_at,
                             spots, total_cost_cents, share_cents, notes)
  values ('55555555-0000-4000-8000-000000000020', v_shift_public, p_worker1, 'airbnb',
          'BunkUp — 10 min from venue', 'Eastside, near Dock B',
          current_date + 8 + interval '12 hours', current_date + 9 + interval '10 hours',
          4, 24000, 6000, 'Two doubles + a couch. Late load-out OK.')
  on conflict (id) do nothing;

  insert into pool_members (id, pool_id, worker_id, spots_needed, status)
  values ('55555555-0000-4000-8000-000000000021',
          '55555555-0000-4000-8000-000000000020', p_worker2, 1, 'joined')
  on conflict (id) do nothing;

  -- CrewBoard demo: open borrow ask + an announce post
  insert into crew_posts (id, shift_id, author_worker_id, category, direction,
                          title, body, amount_cents)
  values ('55555555-0000-4000-8000-000000000030', v_shift_public, p_worker2, 'borrow', 'want',
          'Spare black work gloves?', 'Mine walked off at load-in. Will pay $5 for the weekend.',
          500)
  on conflict (id) do nothing;

  insert into crew_posts (id, shift_id, author_worker_id, category, direction,
                          title, body)
  values ('55555555-0000-4000-8000-000000000031', v_shift_public, p_worker1, 'announce', 'offer',
          'Extra harness available', 'Brought a spare Petzl — free to borrow for the weekend.')
  on conflict (id) do nothing;

  -- GrubRun demo: Alex runs a burrito order before show call; Jordan's
  -- order is still 'placed' so the board shows the pre-confirm state.
  insert into food_runs (id, shift_id, runner_worker_id, restaurant,
                         order_cutoff_at, delivery_area, notes)
  values ('55555555-0000-4000-8000-000000000040', v_shift_public, p_worker1,
          'El Burrito Grande', current_date + 8 + interval '15 hours',
          'Dock B at 18:30', 'Cash or IOU — list your order by 15:00.')
  on conflict (id) do nothing;

  insert into food_run_orders (id, run_id, worker_id, item, notes)
  values ('55555555-0000-4000-8000-000000000041',
          '55555555-0000-4000-8000-000000000040', p_worker2,
          'Carnitas burrito, no onions', 'Extra napkins please')
  on conflict (id) do nothing;

  -- ------------------------------------------------------------------
  -- SmartAlerts demo: venue parking intel + worker locations + confirmed
  -- bookings — the briefing trigger generates gear/parking/departure alerts.
  -- ------------------------------------------------------------------
  update venues
  set overnight_parking = true,
      parking_notes = 'Crew lot C — overnight OK for the weekend, badge on dash. No camping inside Gate 4.',
      parking_json = '{"crew_lot":"Lot C, enter Gate 2","shuttle":"Golf carts run lot->dock on the hour"}'::jsonb
  where id = v_venue;

  insert into worker_sensitive (worker_id, latitude, longitude) values
    (p_worker1, 37.4419, -122.1430),   -- Palo Alto
    (p_worker2, 37.8044, -122.2712)    -- Oakland
  on conflict (worker_id) do nothing;

  -- Confirmed bookings on the crew-pool shift; the confirm trigger writes
  -- each worker's gear/parking/departure briefing rows automatically.
  insert into shift_assignments (id, shift_id, worker_id, status, source, offered_rate, confirmed_at)
  values ('55555555-0000-4000-8000-000000000050', v_shift_public, p_worker1,
          'confirmed', 'roster_broadcast', 44.00, now() - interval '1 day'),
         ('55555555-0000-4000-8000-000000000051', v_shift_public, p_worker2,
          'confirmed', 'public_marketplace', 44.00, now() - interval '12 hours')
  on conflict (id) do nothing;

  -- ------------------------------------------------------------------
  -- Company OS demo: alerts inbox — one resolved alert shows the audit
  -- trail; live ones generate themselves on inbox load via the sweep.
  -- ------------------------------------------------------------------
  insert into company_alerts (id, company_id, kind, severity, status, title, body,
                              dedupe_key, event_id, due_at, resolved_at)
  values
    ('cccccccc-0000-4000-8000-000000000001', v_company, 'timesheet_pending', 'warning',
     'resolved', 'Timesheet waiting — Jordan Lee',
     'Metro Gala · Stagehands · submitted Mon 03 Nov 18:20 UTC',
     'timesheet:demo-seeded-1', v_event, now() - interval '3 days', now() - interval '2 days')
  on conflict (id) do nothing;

end $$;
