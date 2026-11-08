-- ============================================================================
-- Wire up push/SMS dispatch — it has been silently dead since it shipped
-- ============================================================================
-- Found 2026-12-17 while configuring the welcome-email dispatch: the
-- crew_alert_push and send_alert_sms_digests functions read their endpoint
-- + shared secret from custom GUCs (`app.push_fn_url`,
-- `app.push_internal_secret`, `app.sms_digest_fn_url`). Those settings were
-- NEVER configured on the remote database — `pg_settings` shows no app.*
-- keys at all — so every dispatch has hit the `fn_url IS NULL` early-return
-- since 2026-10-25. Push notifications and SMS alert digests have never
-- actually fired in production.
--
-- Why not just ALTER DATABASE ... SET app.*? Two reasons:
--   1. The pooler role gets "permission denied to set parameter" for custom
--      GUCs (verified live 2026-12-17).
--   2. Custom GUC values are readable through pg_settings — fine for a URL,
--      wrong for a shared secret.
--
-- Fix: same config pattern as the welcome-email dispatch (20261218000000):
--   * internal_config table — deny-all RLS, readable only by definer code.
--     Holds the non-secret endpoint URLs.
--   * Supabase Vault secret 'push_internal_secret' — decrypted only inside
--     definer functions; edge functions get the same value via the
--     PUSH_INTERNAL_SECRET function secret (which already exists).
--
-- This migration is self-contained: it recreates internal_config /
-- internal_config_get / internal_secret_get with IF NOT EXISTS /
-- CREATE OR REPLACE so it applies cleanly whether or not the welcome-email
-- migration has landed first.
--
-- Remote setup applied alongside (see AGENT_LOG):
--   internal_config.push_fn_url       = .../functions/v1/send-push
--   internal_config.sms_digest_fn_url = .../functions/v1/alert-digest
--   vault secret 'push_internal_secret' = <random hex>
--   function secret PUSH_INTERNAL_SECRET = same value (overwrites the
--     stale one — nothing could have been using it while dispatch was dead)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Non-secret internal config (endpoint URLs). Deny-all RLS + no client
-- grants: only SECURITY DEFINER functions read it.
CREATE TABLE IF NOT EXISTS internal_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE internal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_config FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal_config_get(p_key text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT value FROM internal_config WHERE key = p_key
$$;
REVOKE ALL ON FUNCTION internal_config_get(text) FROM PUBLIC, anon, authenticated;

-- Vault-backed secret reader for internal dispatchers. decrypted_secrets
-- is only readable by privileged roles; definer functions run as owner.
CREATE OR REPLACE FUNCTION internal_secret_get(p_name text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
   WHERE name = p_name LIMIT 1
$$;
REVOKE ALL ON FUNCTION internal_secret_get(text) FROM PUBLIC, anon, authenticated;

-- Push dispatch — identical logic to 20261119000000 except config source:
-- internal_config + Vault instead of custom GUCs. Per-kind push opt-out
-- via alert_preferences is preserved.
CREATE OR REPLACE FUNCTION crew_alert_push() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  fn_url text := internal_config_get('push_fn_url');
  secret text := internal_secret_get('push_internal_secret');
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

-- SMS digest sweep — identical batching logic, same config swap.
CREATE OR REPLACE FUNCTION send_alert_sms_digests() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  fn_url text := internal_config_get('sms_digest_fn_url');
  secret text := internal_secret_get('push_internal_secret');
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
REVOKE ALL ON FUNCTION crew_alert_push() FROM PUBLIC;
