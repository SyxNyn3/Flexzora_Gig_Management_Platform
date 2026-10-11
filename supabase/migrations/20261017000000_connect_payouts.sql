-- Stripe Connect: worker onboarding state on worker_sensitive.
-- stripe_connect_account_id + payouts_enabled already exist; this adds the
-- last-synced timestamp and details-submitted flag the status function writes.

ALTER TABLE worker_sensitive
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connect_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- #47: Connect fields are server-owned. The worker_sensitive policy is
-- FOR ALL self-scoped, so a worker (or anyone holding their session) could
-- write their own stripe_connect_account_id / payouts_enabled and
-- release-payout would wire money there. connect-onboard / connect-status
-- write these with the service role; API roles may only touch the private
-- location columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_worker_sensitive_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_connect_account_id IS NOT NULL
       OR COALESCE(NEW.payouts_enabled, false)
       OR COALESCE(NEW.stripe_connect_details_submitted, false)
       OR NEW.connect_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Payout account fields are set by Stripe Connect onboarding only'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id
     OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled
     OR NEW.stripe_connect_details_submitted IS DISTINCT FROM OLD.stripe_connect_details_submitted
     OR NEW.connect_updated_at IS DISTINCT FROM OLD.connect_updated_at THEN
    RAISE EXCEPTION 'Payout account fields are set by Stripe Connect onboarding only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS worker_sensitive_guard_write ON worker_sensitive;
CREATE TRIGGER worker_sensitive_guard_write BEFORE INSERT OR UPDATE ON worker_sensitive
  FOR EACH ROW EXECUTE FUNCTION guard_worker_sensitive_write();

-- ---------------------------------------------------------------------------
-- #24: atomic release claim. release-payout must own the row before it
-- talks to Stripe, so two concurrent releases (or a retry after a crash
-- between transfers.create and the paid-update) can't double-pay.
--   queued/failed            -> claimable
--   processing, stale > 10m  -> re-claimable (the Stripe idempotency key
--                               keyed on payout.id makes the retry safe)
--   paid / fresh processing  -> not claimable (0 rows)
-- Service-role only; the edge function calls it with the admin client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_payout_for_release(p_payout_id uuid)
RETURNS SETOF payouts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  UPDATE payouts
     SET status = 'processing', updated_at = now(), failure_reason = NULL
   WHERE id = p_payout_id
     AND (status IN ('queued', 'failed')
          OR (status = 'processing' AND updated_at < now() - interval '10 minutes'))
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION claim_payout_for_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_payout_for_release(uuid) TO service_role;
