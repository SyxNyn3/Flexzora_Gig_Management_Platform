-- Stripe Connect: worker onboarding state on worker_sensitive.
-- stripe_connect_account_id + payouts_enabled already exist; this adds the
-- last-synced timestamp and details-submitted flag the status function writes.

ALTER TABLE worker_sensitive
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connect_updated_at timestamptz;
