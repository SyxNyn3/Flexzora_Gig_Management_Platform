-- Red-team #19: board-resolve minted an IOU on the FULFILLER without their
-- consent (paid 'offer' posts — the author names a debtor who never agreed).
--
-- Fulfil-accept gate: resolving a paid offer now parks as 'awaiting_accept'
-- and alerts the fulfiller; the IOU mints only when the fulfiller accepts.
-- 'want' posts are unaffected — the author IS the debtor, so their resolve
-- is the consent. Free fulfilments (no amount) mint nothing and still
-- resolve directly. Decline returns the post to open with the nomination
-- cleared; the author may also withdraw the nomination.
--
-- This migration OR-replaces objects first defined in
-- 20261103000000_p0rt_company_consent.sql — the guard keeps ALL of that
-- migration's checks (self-fulfill, resolved immutability, consent-stamp
-- rules, paid-resolve-needs-fulfiller) and adds the awaiting_accept rules.
-- Minting stays single-site in settle_crew_post; mint_crew_post_iou gains an
-- idempotency guard so the legacy stamp path cannot double-mint.

ALTER TYPE crew_post_status ADD VALUE IF NOT EXISTS 'awaiting_accept';

CREATE OR REPLACE FUNCTION guard_crew_post_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
  v_debtor uuid := CASE WHEN OLD.direction = 'want' THEN OLD.author_worker_id ELSE OLD.fulfilled_by_worker_id END;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.author_worker_id <> OLD.author_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Post author and shift are immutable';
  END IF;

  -- Once resolved, the fulfiller and amount are exactly what the debtor agreed to.
  IF OLD.status = 'resolved' AND (NEW.fulfilled_by_worker_id IS DISTINCT FROM OLD.fulfilled_by_worker_id
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR NEW.direction <> OLD.direction) THEN
    RAISE EXCEPTION 'Resolved posts cannot change their fulfiller or amount';
  END IF;
  IF NEW.fulfilled_by_worker_id IS NOT NULL AND NEW.fulfilled_by_worker_id = NEW.author_worker_id THEN
    RAISE EXCEPTION 'A post cannot be fulfilled by its own author';
  END IF;

  -- Consent is recorded only by the debtor, only once, only on a resolved post.
  IF NEW.debtor_confirmed_at IS DISTINCT FROM OLD.debtor_confirmed_at THEN
    IF v_me IS DISTINCT FROM v_debtor OR OLD.status <> 'resolved' OR OLD.debtor_confirmed_at IS NOT NULL
       OR NEW.debtor_confirmed_at IS NULL OR NEW.status <> OLD.status
       OR NEW.title <> OLD.title OR NEW.body IS DISTINCT FROM OLD.body OR NEW.category <> OLD.category THEN
      RAISE EXCEPTION 'Only the debtor can accept a resolved post';
    END IF;
    RETURN NEW;
  END IF;

  -- Resolving: a paid post must name a fulfiller; if the debtor is the one
  -- resolving (want posts), that action is their consent.
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    IF coalesce(NEW.amount_cents, 0) > 0 AND NEW.fulfilled_by_worker_id IS NULL THEN
      RAISE EXCEPTION 'Name who fulfilled the post before resolving it';
    END IF;
    IF v_me IS NOT DISTINCT FROM v_debtor THEN
      NEW.debtor_confirmed_at := now();
    END IF;
  END IF;

  IF OLD.author_worker_id = v_me THEN
    IF OLD.status = 'closed' THEN RAISE EXCEPTION 'Closed posts cannot be changed'; END IF;
    IF OLD.status = 'awaiting_accept' THEN
      -- the fulfiller owns the decision; the author may only withdraw the
      -- nomination (open + no fulfiller) or close the post outright
      IF NOT ((NEW.status = 'open' AND NEW.fulfilled_by_worker_id IS NULL) OR NEW.status = 'closed') THEN
        RAISE EXCEPTION 'Awaiting the fulfiller — withdraw the nomination or close the post';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT (NEW.status IN ('open', 'resolved', 'awaiting_accept', 'closed')) THEN
      RAISE EXCEPTION 'Invalid post status';
    END IF;
    IF OLD.status = 'resolved' AND NEW.status = 'open' THEN
      RAISE EXCEPTION 'Resolved posts cannot be reopened — close and repost';
    END IF;
    RETURN NEW;
  END IF;
  -- hiring company may close posts (moderation)
  IF owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    IF NEW.status <> 'closed' OR OLD.status = 'closed' THEN
      RAISE EXCEPTION 'Company can only close posts';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Not a party to this post';
END;
$$ LANGUAGE plpgsql;

-- Consent gate lives in the settle trigger so every resolve path (current
-- client UPDATE, future callers) lands on the same rule. Minting happens
-- here and ONLY here for the fulfil-gate flow: 'want' resolves mint at
-- resolve (author resolved = author consented); paid 'offer' posts mint
-- when the RPC flips awaiting_accept → resolved (fulfiller accepted).
CREATE OR REPLACE FUNCTION settle_crew_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_debtor uuid;
  v_creditor uuid;
  v_kind crew_iou_kind;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'resolved' AND NEW.status = 'resolved' THEN
    -- paid offer: the fulfiller is the debtor — the author cannot commit
    -- them to owing. Park once (the awaiting_accept → resolved accept path
    -- must pass through untouched, or accept can never complete).
    IF OLD.status <> 'awaiting_accept'
       AND NEW.direction = 'offer'
       AND NEW.amount_cents IS NOT NULL AND NEW.amount_cents > 0
       AND NEW.fulfilled_by_worker_id IS NOT NULL THEN
      NEW.status := 'awaiting_accept';
      NEW.resolved_at := NULL;
      INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id)
      VALUES (NEW.fulfilled_by_worker_id, NEW.shift_id, 'iou', 'Fulfilment to accept',
        '"' || NEW.title || '" names you as fulfiller — ' ||
        to_char(NEW.amount_cents / 100.0, 'FM999999990.00') ||
        ' would come out of your payout. Accept or decline on the crew board.',
        NEW.id);
      RETURN NEW;
    END IF;

    NEW.resolved_at := now();
    IF NEW.amount_cents IS NOT NULL AND NEW.amount_cents > 0 AND NEW.fulfilled_by_worker_id IS NOT NULL THEN
      IF NEW.direction = 'want' THEN
        v_debtor := NEW.author_worker_id;  v_creditor := NEW.fulfilled_by_worker_id;
      ELSE
        v_debtor := NEW.fulfilled_by_worker_id;  v_creditor := NEW.author_worker_id;
      END IF;
      v_kind := CASE NEW.category
                  WHEN 'ride'    THEN 'ride'::crew_iou_kind
                  WHEN 'lodging' THEN 'lodging'::crew_iou_kind
                  WHEN 'food'    THEN 'food'::crew_iou_kind
                  WHEN 'borrow'  THEN 'gear'::crew_iou_kind
                  ELSE 'other'::crew_iou_kind
                END;
      INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                            beneficiary_worker_id, iou_group_id, notes)
      VALUES (v_debtor, NEW.shift_id, v_kind, NEW.amount_cents,
              v_creditor, NEW.id, 'CrewBoard — ' || NEW.title);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Legacy consent path (#86): a debtor stamping debtor_confirmed_at directly
-- on a pre-gate resolved post still mints — but only if no IOU exists yet,
-- so the settle trigger and this trigger can never both fire for one post.
CREATE OR REPLACE FUNCTION mint_crew_post_iou() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_debtor uuid;
  v_creditor uuid;
  v_kind crew_iou_kind;
BEGIN
  IF NEW.debtor_confirmed_at IS NULL OR OLD.debtor_confirmed_at IS NOT NULL THEN RETURN NULL; END IF;
  IF coalesce(NEW.amount_cents, 0) <= 0 OR NEW.fulfilled_by_worker_id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM crew_iou WHERE iou_group_id = NEW.id) THEN RETURN NULL; END IF;
  IF NEW.direction = 'want' THEN
    v_debtor := NEW.author_worker_id;  v_creditor := NEW.fulfilled_by_worker_id;
  ELSE
    v_debtor := NEW.fulfilled_by_worker_id;  v_creditor := NEW.author_worker_id;
  END IF;
  v_kind := CASE NEW.category
              WHEN 'ride'    THEN 'ride'::crew_iou_kind
              WHEN 'lodging' THEN 'lodging'::crew_iou_kind
              WHEN 'food'    THEN 'food'::crew_iou_kind
              WHEN 'borrow'  THEN 'gear'::crew_iou_kind
              ELSE 'other'::crew_iou_kind
            END;
  INSERT INTO crew_iou (worker_id, shift_id, kind, amount_cents,
                        beneficiary_worker_id, iou_group_id, notes)
  VALUES (v_debtor, NEW.shift_id, v_kind, NEW.amount_cents,
          v_creditor, NEW.id, 'CrewBoard — ' || NEW.title);
  RETURN NULL;
END $$;

-- Debtor accepts: the post resolves (settle trigger mints the IOU) and the
-- debtor's consent is stamped as the audit record.
CREATE OR REPLACE FUNCTION accept_fulfilment(p_post_id uuid)
RETURNS crew_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  p crew_posts%ROWTYPE;
BEGIN
  SELECT * INTO p FROM crew_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF p.fulfilled_by_worker_id IS DISTINCT FROM current_profile_id() THEN
    RAISE EXCEPTION 'Only the named fulfiller can accept' USING ERRCODE = '42501';
  END IF;
  IF p.status <> 'awaiting_accept' THEN
    RAISE EXCEPTION 'Post is % — nothing to accept', p.status;
  END IF;
  UPDATE crew_posts SET status = 'resolved', debtor_confirmed_at = now() WHERE id = p.id;
  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id)
  VALUES (p.author_worker_id, p.shift_id, 'iou', 'Fulfilment accepted',
    'The fulfiller accepted "' || p.title || '" — the share is on the ledger.', p.id);
  SELECT * INTO p FROM crew_posts WHERE id = p.id;
  RETURN p;
END $$;

-- Debtor declines: nomination cleared, post re-opens, author alerted.
CREATE OR REPLACE FUNCTION decline_fulfilment(p_post_id uuid)
RETURNS crew_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  p crew_posts%ROWTYPE;
BEGIN
  SELECT * INTO p FROM crew_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF p.fulfilled_by_worker_id IS DISTINCT FROM current_profile_id() THEN
    RAISE EXCEPTION 'Only the named fulfiller can decline' USING ERRCODE = '42501';
  END IF;
  IF p.status <> 'awaiting_accept' THEN
    RAISE EXCEPTION 'Post is % — nothing to decline', p.status;
  END IF;
  UPDATE crew_posts SET status = 'open', fulfilled_by_worker_id = NULL WHERE id = p.id;
  INSERT INTO crew_alerts (worker_id, shift_id, kind, title, body, ref_id)
  VALUES (p.author_worker_id, p.shift_id, 'iou', 'Fulfilment declined',
    'The fulfiller declined "' || p.title || '" — your post is open again.', p.id);
  SELECT * INTO p FROM crew_posts WHERE id = p.id;
  RETURN p;
END $$;

GRANT EXECUTE ON FUNCTION accept_fulfilment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_fulfilment(uuid) TO authenticated;
