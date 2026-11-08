-- ============================================================================
-- Welcome-to-beta email on waitlist claim
-- ============================================================================
-- Product gap (2026-12-17): a verified waitlist row that gets claimed by a
-- new signup produced no email at all — the only lifecycle mail was the
-- verification link sent before signup. Founding testers especially need
-- the "you're in, early builds land with you" signal.
--
-- Design: mirror the crew_alert_push dispatch pattern (pg_net -> edge fn
-- gated by a shared secret, fire-and-forget so mail latency/failure can
-- never break the claim RPC). The trigger fires AFTER UPDATE only when
-- claimed_by_profile_id transitions NULL -> value, which happens exactly
-- once per row inside waitlist_claim (the UPDATE ... WHERE
-- claimed_by_profile_id IS NULL race makes double-claim impossible).
--
-- Config lives in `internal_config` + Supabase Vault, NOT custom GUCs:
--   * ALTER DATABASE ... SET app.* requires privileges the pooler role
--     doesn't have, and custom GUC values are readable through pg_settings
--     — fine for a URL, wrong for a shared secret.
--   * internal_config holds non-secret keys (mail_fn_url); RLS enabled with
--     no policies + no client grants means only security-definer code reads it.
--   * The shared secret lives in vault.secrets as 'internal_shared_secret',
--     decrypted only inside the definer trigger; edge functions get the same
--     value via the INTERNAL_SHARED_SECRET function secret.
--
-- Remote setup applied alongside this migration (see AGENT_LOG):
--   internal_config.mail_fn_url =
--     'https://qjtro…supabase.co/functions/v1/send-welcome-email'
--   vault secret 'internal_shared_secret' = <random hex>
--   function secret INTERNAL_SHARED_SECRET = same value
-- Without config the trigger silently no-ops — mail must never break signup.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Tiny key/value store for non-secret internal config. Deny-all RLS: the
-- only readers are SECURITY DEFINER functions (table owner bypasses RLS).
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

CREATE OR REPLACE FUNCTION waiting_list_claim_email() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  fn_url text := internal_config_get('mail_fn_url');
  secret text;
BEGIN
  -- Only the claim transition dispatches; every other update is ignored.
  IF NEW.claimed_by_profile_id IS NULL
     OR NEW.claimed_by_profile_id IS NOT DISTINCT FROM OLD.claimed_by_profile_id THEN
    RETURN NEW;
  END IF;

  -- Shared secret from Supabase Vault. decrypted_secrets is only readable
  -- by privileged roles; this definer function runs as the table owner.
  SELECT decrypted_secret INTO secret
    FROM vault.decrypted_secrets
   WHERE name = 'internal_shared_secret'
   LIMIT 1;

  IF fn_url IS NULL OR fn_url = '' OR secret IS NULL OR secret = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := fn_url,
    body := jsonb_build_object('waitlist_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', secret
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS waiting_list_claim_email ON waiting_list;
CREATE TRIGGER waiting_list_claim_email
  AFTER UPDATE OF claimed_by_profile_id ON waiting_list
  FOR EACH ROW EXECUTE FUNCTION waiting_list_claim_email();

REVOKE ALL ON FUNCTION waiting_list_claim_email() FROM PUBLIC;
