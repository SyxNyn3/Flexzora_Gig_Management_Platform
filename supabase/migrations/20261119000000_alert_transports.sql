-- Crew OS deeper: SmartAlerts transports.
--
-- Alerts were in-app + all-or-nothing push. Now: per-kind preferences
-- (push on/off, SMS digest on/off) and a scheduled digest that batches
-- unsent SMS-enabled alerts into one Twilio send per worker — flag-gated
-- on app.sms_digest_fn_url like the push path, no-op until provisioned.
-- FCM/APNs native push remains the mobile-app item; Web Push is the push
-- transport for now.

CREATE TABLE IF NOT EXISTS alert_preferences (
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind crew_alert_kind NOT NULL,
  push boolean NOT NULL DEFAULT true,
  sms boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, kind)
);

ALTER TABLE alert_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_preferences own" ON alert_preferences;
CREATE POLICY "alert_preferences own" ON alert_preferences FOR ALL TO authenticated
  USING (worker_id = current_profile_id())
  WITH CHECK (worker_id = current_profile_id());

ALTER TABLE crew_alerts ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS crew_alerts_sms_pending_idx
  ON crew_alerts (worker_id, created_at) WHERE sms_sent_at IS NULL;

-- Push dispatch now honors the worker's per-kind preference (no row = on).
CREATE OR REPLACE FUNCTION crew_alert_push() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  fn_url text := current_setting('app.push_fn_url', true);
  secret text := current_setting('app.push_internal_secret', true);
BEGIN
  IF fn_url IS NULL OR fn_url = '' OR secret IS NULL OR secret = '' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM alert_preferences p
             WHERE p.worker_id = NEW.worker_id AND p.kind = NEW.kind AND NOT p.push) THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := fn_url,
    body := jsonb_build_object(
      'worker_id', NEW.worker_id,
      'title', NEW.title,
      'body', NEW.body,
      'url', coalesce('/shifts/' || NEW.shift_id::text || '/crew', '/dashboard')
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Secret', secret
    )
  );
  RETURN NEW;
END $$;

-- SMS digest sweep: batch unsent alerts of SMS-enabled kinds into one send
-- per worker. Items wait 15 minutes so a burst (confirm → briefing → buddy
-- hints) rolls up instead of texting three times.
CREATE OR REPLACE FUNCTION send_alert_sms_digests() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  fn_url text := current_setting('app.sms_digest_fn_url', true);
  secret text := current_setting('app.push_internal_secret', true);
  v_batch record;
  v_count integer := 0;
BEGIN
  IF fn_url IS NULL OR fn_url = '' OR secret IS NULL OR secret = '' THEN
    RETURN 0;
  END IF;

  FOR v_batch IN
    SELECT a.worker_id,
           jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body)
                     ORDER BY a.created_at) AS items,
           array_agg(a.id) AS alert_ids
      FROM crew_alerts a
     WHERE a.sms_sent_at IS NULL
       AND a.created_at BETWEEN now() - interval '24 hours' AND now() - interval '15 minutes'
       AND EXISTS (SELECT 1 FROM alert_preferences p
                   WHERE p.worker_id = a.worker_id AND p.kind = a.kind AND p.sms)
       AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = a.worker_id AND pr.phone IS NOT NULL)
     GROUP BY a.worker_id
  LOOP
    UPDATE crew_alerts SET sms_sent_at = now() WHERE id = ANY(v_batch.alert_ids);
    PERFORM net.http_post(
      url := fn_url,
      body := jsonb_build_object('worker_id', v_batch.worker_id, 'items', v_batch.items),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Push-Secret', secret
      )
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION send_alert_sms_digests() FROM public;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alert-sms-digest') THEN
    PERFORM cron.unschedule('alert-sms-digest');
  END IF;
  PERFORM cron.schedule('alert-sms-digest', '*/30 * * * *', 'SELECT send_alert_sms_digests()');
END $$;
