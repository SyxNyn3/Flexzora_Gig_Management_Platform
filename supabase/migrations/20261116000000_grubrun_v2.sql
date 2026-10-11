-- Crew OS deeper: GrubRun v2 — runner substitution, minimum orders, late-cancel
-- fee.
--
--   substitution : runner hands the run to another confirmed crew member via
--                  pending_runner_worker_id + accept/decline; committed order
--                  IOUs re-point to whoever's actually collecting
--   minimums     : min_orders blocks the open→ordered transition until the
--                  run is worth the trip — the runner isn't committed to a
--                  one-burrito errand
--   late cancel  : orderer cancels their own 'placed' order after the cutoff
--                  → a flat late_fee_cents IOU mints to the runner (sunk cost
--                  shared); runner/company cancels and run-cancel still void

ALTER TABLE food_runs ADD COLUMN IF NOT EXISTS min_orders integer NOT NULL DEFAULT 0;
ALTER TABLE food_runs ADD COLUMN IF NOT EXISTS late_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE food_runs ADD COLUMN IF NOT EXISTS pending_runner_worker_id uuid REFERENCES profiles(id);

-- ---------------------------------------------------------------------------
-- Guard: pending_runner is system-managed (handoff RPCs only); 'ordered'
-- requires the minimum order count when set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_food_run_update() RETURNS trigger AS $$
DECLARE
  v_live int;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.runner_worker_id <> OLD.runner_worker_id OR NEW.shift_id <> OLD.shift_id
     OR NEW.pending_runner_worker_id IS DISTINCT FROM OLD.pending_runner_worker_id THEN
    RAISE EXCEPTION 'Run runner, handoff target, and shift are managed by the handoff flow';
  END IF;
  IF OLD.runner_worker_id <> current_profile_id()
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this food run';
  END IF;
  IF OLD.status IN ('cancelled', 'delivered') THEN RAISE EXCEPTION 'Closed runs cannot be changed'; END IF;
  IF NEW.status = 'ordered' AND OLD.status = 'open' AND OLD.min_orders > 0 THEN
    SELECT count(*) INTO v_live FROM food_run_orders
     WHERE run_id = OLD.id AND status IN ('placed', 'confirmed');
    IF v_live < OLD.min_orders THEN
      RAISE EXCEPTION 'Run needs % more order(s) before committing', OLD.min_orders - v_live;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Handoff RPCs (definer — the guard treats runner fields as system-managed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION offer_run_handoff(p_run_id uuid, p_new_runner uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM food_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'Food run not found'; END IF;
  IF v_run.status <> 'open' THEN RAISE EXCEPTION 'Only open runs can be handed off'; END IF;
  IF v_run.runner_worker_id <> current_profile_id()
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id)) THEN
    RAISE EXCEPTION 'Only the runner or the hiring company can hand off a run';
  END IF;
  IF p_new_runner = v_run.runner_worker_id THEN RAISE EXCEPTION 'Already the runner'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM shift_assignments sa
    WHERE sa.shift_id = v_run.shift_id AND sa.worker_id = p_new_runner AND sa.status = 'confirmed'
  ) THEN RAISE EXCEPTION 'Handoff target must be confirmed crew on this shift'; END IF;

  UPDATE food_runs SET pending_runner_worker_id = p_new_runner, updated_at = now() WHERE id = p_run_id;

  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  VALUES (p_new_runner, 'Food run handoff',
          format('%s wants you to take over the %s run.', (SELECT full_name FROM profiles WHERE id = v_run.runner_worker_id), v_run.restaurant),
          'info', '/crew/' || v_run.shift_id::text,
          jsonb_build_object('run_id', v_run.id, 'shift_id', v_run.shift_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION accept_run_handoff(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run food_runs%ROWTYPE;
  v_me uuid := current_profile_id();
BEGIN
  SELECT * INTO v_run FROM food_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'Food run not found'; END IF;
  IF v_run.pending_runner_worker_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'No pending handoff for you on this run';
  END IF;

  UPDATE food_runs
     SET runner_worker_id = v_me, pending_runner_worker_id = NULL, updated_at = now()
   WHERE id = p_run_id;

  -- whoever collects the food now collects the IOUs already minted
  UPDATE crew_iou SET beneficiary_worker_id = v_me, updated_at = now()
   WHERE iou_group_id IN (SELECT id FROM food_run_orders WHERE run_id = p_run_id)
     AND status = 'committed' AND beneficiary_worker_id = v_run.runner_worker_id;

  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  VALUES (v_run.runner_worker_id, 'Handoff accepted',
          format('%s took over the %s run.', (SELECT full_name FROM profiles WHERE id = v_me), v_run.restaurant),
          'info', '/crew/' || v_run.shift_id::text,
          jsonb_build_object('run_id', v_run.id, 'shift_id', v_run.shift_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION decline_run_handoff(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run food_runs%ROWTYPE;
  v_me uuid := current_profile_id();
BEGIN
  SELECT * INTO v_run FROM food_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'Food run not found'; END IF;
  IF v_run.pending_runner_worker_id IS NULL THEN RAISE EXCEPTION 'No pending handoff'; END IF;
  IF v_me IS DISTINCT FROM v_run.pending_runner_worker_id
     AND v_me IS DISTINCT FROM v_run.runner_worker_id
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = v_run.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this handoff';
  END IF;

  UPDATE food_runs SET pending_runner_worker_id = NULL, updated_at = now() WHERE id = p_run_id;

  INSERT INTO notifications (user_id, title, message, type, action_url, metadata)
  VALUES (v_run.runner_worker_id, 'Handoff declined',
          format('%s declined the %s run — it''s still yours.', (SELECT full_name FROM profiles WHERE id = v_me), v_run.restaurant),
          'warning', '/crew/' || v_run.shift_id::text,
          jsonb_build_object('run_id', v_run.id, 'shift_id', v_run.shift_id));
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION offer_run_handoff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_run_handoff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_run_handoff(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sync: unchanged mint/void paths + the late-cancel fee.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_food_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_run food_runs%ROWTYPE;
BEGIN
  -- Debt mints only after consent (grub price-lock, #52): auto-stamped at
  -- confirm for at/below-cap prices, or by the orderer's accept for above-cap.
  IF TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND NEW.price_accepted_at IS NOT NULL
     AND OLD.price_accepted_at IS NULL THEN
    SELECT * INTO v_run FROM food_runs WHERE id = NEW.run_id;
    INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                          beneficiary_worker_id, iou_group_id, notes)
    VALUES (NEW.worker_id, v_run.shift_id, 'food', NEW.price_cents,
            v_run.runner_worker_id, NEW.id,
            'GrubRun — ' || v_run.restaurant || ': ' || left(NEW.item, 80));
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = OLD.id AND status = 'committed';
  END IF;

  -- Orderer's own cancel of a still-placed order after the cutoff → fee.
  IF TG_OP = 'UPDATE' AND OLD.status = 'placed' AND NEW.status = 'cancelled'
     AND current_profile_id() = OLD.worker_id THEN
    SELECT * INTO v_run FROM food_runs WHERE id = OLD.run_id;
    IF v_run.late_fee_cents > 0 AND v_run.order_cutoff_at < now() THEN
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, iou_group_id, notes)
      VALUES (OLD.worker_id, v_run.shift_id, 'food', v_run.late_fee_cents,
              v_run.runner_worker_id, OLD.id,
              'Late cancel — ' || v_run.restaurant);
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id, dedupe_key)
      VALUES (v_run.runner_worker_id, v_run.shift_id, 'iou',
              'Late-cancel fee committed',
              format('An orderer cancelled after the cutoff — $%s late fee is committed to you.', round(v_run.late_fee_cents / 100.0, 2)),
              OLD.id, 'latecancel:food:' || OLD.id::text)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
