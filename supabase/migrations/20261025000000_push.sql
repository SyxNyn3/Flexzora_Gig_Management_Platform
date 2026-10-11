-- Push notifications: device subscriptions + trigger dispatch to send-push.
--
-- push_subscriptions: Web Push endpoints per worker (self-managed via RLS).
--
-- Dispatch: when a crew_alert lands, the trigger fires an async pg_net POST
-- to the send-push edge function IF `app.push_fn_url` is configured (e.g.
--   ALTER DATABASE ... SET app.push_fn_url = 'https://<ref>.functions.supabase.co/send-push';
-- ). Unset -> pushes are simply skipped; the in-app feed still works.
-- The internal call carries PUSH_INTERNAL_SECRET as a shared secret so
-- only the database (or whoever knows the secret) can trigger sends.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_worker_idx ON push_subscriptions (worker_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions own" ON push_subscriptions;
CREATE POLICY "push_subscriptions own" ON push_subscriptions FOR ALL TO authenticated
  USING (worker_id = current_profile_id())
  WITH CHECK (worker_id = current_profile_id());

-- pg_net may not exist on every project; dispatch silently skips without it.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

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

DROP TRIGGER IF EXISTS crew_alert_push ON crew_alerts;
CREATE TRIGGER crew_alert_push AFTER INSERT ON crew_alerts
  FOR EACH ROW EXECUTE FUNCTION crew_alert_push();
