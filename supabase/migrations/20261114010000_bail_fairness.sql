-- Crew OS deeper: bail fairness.
--
-- Today a rider/bunkmate can walk away minutes before call and the IOU voids
-- entirely — the driver/host eats a seat they can't refill. A *voluntary* exit
-- inside the bail window keeps a % of the share committed instead.
--
-- Voluntary = rider's own matched→withdrawn, member's own joined→left.
-- Driver cancels, host removes, and shift/pool cascades still void fully —
-- nobody gets bail money for someone else's cancellation.
--
-- Policy lives in platform_policies (tunable without a migration):
--   bail.window_hours — how close to shift start the rule bites (default 24)
--   bail.keep_pct     — % of the IOU that stays committed (default 50)

CREATE TABLE IF NOT EXISTS platform_policies (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_policies (key, value)
VALUES ('bail', '{"window_hours": 24, "keep_pct": 50}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE platform_policies ENABLE ROW LEVEL SECURITY;
-- Anyone signed in may read policy values; only definer functions write.
DROP POLICY IF EXISTS "platform_policies read" ON platform_policies;
CREATE POLICY "platform_policies read" ON platform_policies FOR SELECT TO authenticated USING (true);

-- Late-bail check: true when the shift starts inside the window (or already
-- started). Returns the kept cents for a given IOU amount (0 → full void).
CREATE OR REPLACE FUNCTION bail_kept_cents(p_shift_id uuid, p_amount_cents integer)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_window interval;
  v_pct numeric;
  v_start timestamptz;
BEGIN
  SELECT (value ->> 'window_hours')::int * interval '1 hour',
         (value ->> 'keep_pct')::numeric
  INTO v_window, v_pct
  FROM platform_policies WHERE key = 'bail';
  v_window := COALESCE(v_window, interval '24 hours');
  v_pct := COALESCE(v_pct, 50);

  SELECT starts_at INTO v_start FROM shifts WHERE id = p_shift_id;
  IF v_start IS NULL OR v_start - now() > v_window THEN
    RETURN 0;
  END IF;
  RETURN round(p_amount_cents * v_pct / 100.0)::int;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rides: only the rider's own matched→withdrawn can keep a bail share.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_ride_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_offer ride_offers%ROWTYPE;
  v_keep int;
  v_beneficiary uuid;
BEGIN
  -- new match: take seats + mint the gas-share IOU
  IF NEW.status = 'matched' AND NEW.offer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'matched' OR OLD.offer_id IS DISTINCT FROM NEW.offer_id) THEN
    SELECT * INTO v_offer FROM ride_offers WHERE id = NEW.offer_id FOR UPDATE;
    UPDATE ride_offers
       SET seats_taken = seats_taken + NEW.seats_needed,
           status = CASE WHEN seats_taken + NEW.seats_needed >= seats THEN 'full'::ride_offer_status ELSE status END
     WHERE id = v_offer.id;
    IF v_offer.gas_share_cents > 0 THEN
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, iou_group_id, notes)
      VALUES (NEW.rider_worker_id, NEW.shift_id, 'ride',
              v_offer.gas_share_cents * NEW.seats_needed,
              v_offer.driver_worker_id, v_offer.id,
              'Gas share — ride offer ' || v_offer.id);
    END IF;
  END IF;

  -- leaving a match (withdrawn, or switching offers): free seats, reopen the
  -- offer, void the rider's IOU for the old offer only. Skipped while an
  -- offer-cancel cascade is in flight — the cascade resets the offer's own
  -- seat ledger and re-writing the same tuple mid-command raises
  -- "tuple to be updated was already modified".
  IF TG_OP = 'UPDATE' AND OLD.status = 'matched' AND OLD.offer_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM 'matched' OR NEW.offer_id IS DISTINCT FROM OLD.offer_id)
     AND current_setting('app.offer_cancel_cascade', true) IS DISTINCT FROM 'on' THEN
    UPDATE ride_offers
       SET seats_taken = GREATEST(seats_taken - OLD.seats_needed, 0),
           status = CASE WHEN status = 'full' THEN 'open'::ride_offer_status ELSE status END
     WHERE id = OLD.offer_id AND status <> 'cancelled'::ride_offer_status;

    -- Bail fairness: rider's OWN withdrawal inside the window keeps a share.
    IF NEW.status = 'withdrawn' THEN
      SELECT amount_cents, beneficiary_worker_id INTO v_keep, v_beneficiary
      FROM (
        SELECT bail_kept_cents(OLD.shift_id, amount_cents) AS amount_cents, beneficiary_worker_id
        FROM crew_iou
        WHERE iou_group_id = OLD.offer_id AND worker_id = OLD.rider_worker_id AND status = 'committed'
      ) calc;
      IF v_keep IS NOT NULL AND v_keep > 0 THEN
        UPDATE crew_iou
           SET amount_cents = v_keep,
               notes = notes || ' — late bail: kept share',
               updated_at = now()
         WHERE iou_group_id = OLD.offer_id AND worker_id = OLD.rider_worker_id
           AND status = 'committed';
        INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
        SELECT v_beneficiary, OLD.shift_id, 'iou',
               'Late bail — partial share kept',
               format('A rider bailed inside the window — $%s of their gas share stays committed.', round(v_keep / 100.0, 2)),
               OLD.offer_id,
               'bail:ride:' || OLD.id::text
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
        RETURN NEW;
      END IF;
    END IF;
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = OLD.offer_id AND worker_id = OLD.rider_worker_id
       AND status = 'committed';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Lodging: only the member's own joined→left can keep a bail share.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_pool_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_pool lodging_pools%ROWTYPE;
  v_keep int;
  v_beneficiary uuid;
BEGIN
  -- joined: take spots + mint the lodging-share IOU against the pool's shift
  IF NEW.status = 'joined'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'joined') THEN
    SELECT * INTO v_pool FROM lodging_pools WHERE id = NEW.pool_id FOR UPDATE;
    UPDATE lodging_pools
       SET spots_taken = spots_taken + NEW.spots_needed,
           status = CASE WHEN spots_taken + NEW.spots_needed >= spots THEN 'full'::lodging_pool_status ELSE status END
     WHERE id = v_pool.id;
    IF v_pool.share_cents > 0 THEN
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, iou_group_id, notes)
      VALUES (NEW.worker_id, v_pool.shift_id, 'lodging',
              v_pool.share_cents * NEW.spots_needed,
              v_pool.host_worker_id, v_pool.id,
              'Lodging share — ' || v_pool.name);
    END IF;
  END IF;

  -- left/removed/cancelled from joined: free spots, reopen, void the IOU
  IF TG_OP = 'UPDATE' AND OLD.status = 'joined' AND NEW.status IS DISTINCT FROM 'joined' THEN
    UPDATE lodging_pools
       SET spots_taken = GREATEST(spots_taken - OLD.spots_needed, 0),
           status = CASE WHEN status = 'full' THEN 'open'::lodging_pool_status ELSE status END
     WHERE id = OLD.pool_id;

    -- Bail fairness: member's OWN leave inside the window keeps a share.
    IF NEW.status = 'left' THEN
      SELECT amount_cents, beneficiary_worker_id INTO v_keep, v_beneficiary
      FROM (
        SELECT bail_kept_cents(v_pool.shift_id, amount_cents) AS amount_cents, beneficiary_worker_id
        FROM crew_iou
        WHERE iou_group_id = OLD.pool_id AND worker_id = OLD.worker_id AND status = 'committed'
      ) calc;
      IF v_keep IS NOT NULL AND v_keep > 0 THEN
        UPDATE crew_iou
           SET amount_cents = v_keep,
               notes = notes || ' — late bail: kept share',
               updated_at = now()
         WHERE iou_group_id = OLD.pool_id AND worker_id = OLD.worker_id
           AND status = 'committed';
        INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
        SELECT v_beneficiary, v_pool.shift_id, 'iou',
               'Late bail — partial share kept',
               format('A bunkmate bailed inside the window — $%s of their lodging share stays committed.', round(v_keep / 100.0, 2)),
               OLD.pool_id,
               'bail:lodging:' || OLD.id::text
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
        RETURN NEW;
      END IF;
    END IF;
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = OLD.pool_id AND worker_id = OLD.worker_id
       AND status = 'committed';
  END IF;
  RETURN NEW;
END $$;

-- Offer-cancel cascade re-entry guard: opening matched requests fires their
-- sync trigger, which would try to free seats on the offer tuple that is
-- already being updated by this command. A transaction-local flag tells the
-- request sync to skip the seat-free; the cascade resets seats_taken itself.
CREATE OR REPLACE FUNCTION cascade_ride_offer_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM set_config('app.offer_cancel_cascade', 'on', true);
    UPDATE ride_requests
       SET status = 'open', offer_id = NULL, updated_at = now()
     WHERE offer_id = NEW.id AND status = 'matched';
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = NEW.id AND status = 'committed';
    NEW.seats_taken := 0;
  END IF;
  RETURN NEW;
END;
$$;
