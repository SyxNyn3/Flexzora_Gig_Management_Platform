-- Onboarding nudge sweep: in-app reminders for stalled setup, both sides.
--
-- The checklists (SetupChecklist.tsx) show state but never reach out — a
-- worker who abandons the crew card or a company that never posts an event
-- just goes quiet. This daily sweep inserts a `notifications` row (the same
-- channel every other alert uses) when a profile/company is stuck.
--
-- Anti-spam is built into the query, not a separate table: a nudge counts
-- only if no notification carrying the same metadata.nudge key exists in the
-- last 72h, and each step stops after 3 lifetime nudges. Workers get the
-- crew-card nudge; company owners/admins get the first-event nudge (staff
-- aren't nagged about work they may not own).
--
-- Email is deliberately not wired here — in-app is the honest minimum, and
-- the Resend path can be added later behind the same sweep if wanted.

CREATE OR REPLACE FUNCTION public.send_onboarding_nudges() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_count integer := 0;
  v_rows integer;
BEGIN
  -- Workers: signed up >24h ago, still no crew-card skills.
  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  SELECT p.id,
         'Finish your crew card',
         'Companies filter by your skills and markets — an empty crew card means fewer calls find you.',
         'reminder', '/profile',
         jsonb_build_object('nudge', 'crew_card')
    FROM profiles p
   WHERE p.role = 'worker'
     AND p.created_at < now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM worker_skills ws WHERE ws.worker_id = p.id)
     AND (SELECT count(*) FROM notifications n
           WHERE n.user_id = p.id AND n.metadata->>'nudge' = 'crew_card') < 3
     AND NOT EXISTS (SELECT 1 FROM notifications n
           WHERE n.user_id = p.id AND n.metadata->>'nudge' = 'crew_card'
             AND n.created_at > now() - interval '72 hours');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  -- Company owners/admins: company older than 24h with zero events posted.
  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  SELECT m.profile_id,
         'Post your first event',
         'Crew browse open calls — until an event exists, nobody can find or apply to your company.',
         'reminder', '/events',
         jsonb_build_object('nudge', 'first_event', 'company_id', m.company_id)
    FROM company_members m
    JOIN companies c ON c.id = m.company_id
   WHERE m.member_role IN ('owner', 'admin')
     AND c.created_at < now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM events e WHERE e.company_id = c.id)
     AND (SELECT count(*) FROM notifications n
           WHERE n.user_id = m.profile_id AND n.metadata->>'nudge' = 'first_event'
             AND n.metadata->>'company_id' = m.company_id::text) < 3
     AND NOT EXISTS (SELECT 1 FROM notifications n
           WHERE n.user_id = m.profile_id AND n.metadata->>'nudge' = 'first_event'
             AND n.metadata->>'company_id' = m.company_id::text
             AND n.created_at > now() - interval '72 hours');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.send_onboarding_nudges() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-nudges') THEN
    PERFORM cron.unschedule('onboarding-nudges');
  END IF;
  -- Daily at 15:00 UTC — mid-morning US time, after overnight signups settle.
  PERFORM cron.schedule('onboarding-nudges', '0 15 * * *', 'SELECT send_onboarding_nudges()');
END $$;
