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

end $$;
