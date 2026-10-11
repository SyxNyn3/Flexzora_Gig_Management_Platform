-- Red-team #19: board-resolve minted an IOU on the FULFILLER without their
-- consent (paid 'offer' posts — the author names a debtor who never agreed).
--
-- Fulfil-accept gate: resolving a paid offer now parks as 'awaiting_accept'
-- and alerts the fulfiller; the IOU mints only when the fulfiller accepts.
-- 'want' posts are unaffected — the author IS the debtor, so their resolve
-- is the consent. Free fulfilments (no amount) mint nothing and still
-- resolve directly. Decline returns the post to open with the nomination
-- cleared; the author may also withdraw the nomination.

ALTER TYPE crew_post_status ADD VALUE IF NOT EXISTS 'awaiting_accept';

CREATE OR REPLACE FUNCTION guard_crew_post_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.author_worker_id <> OLD.author_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Post author and shift are immutable';
  END IF;
  IF OLD.author_worker_id = current_profile_id() THEN
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
    -- resolving requires naming the fulfiller and forbids re-opening
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
-- client UPDATE, future callers) lands on the same rule.
CREATE OR REPLACE FUNCTION settle_crew_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_debtor uuid;
  v_creditor uuid;
  v_kind crew_iou_kind;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'resolved' AND NEW.status = 'resolved' THEN
    -- paid offer: the fulfiller is the debtor — the author cannot commit
    -- them to owing. Park the post and let them accept or decline.
    IF NEW.direction = 'offer'
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

-- Debtor accepts: the post resolves and the settle trigger mints the IOU.
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
  UPDATE crew_posts SET status = 'resolved' WHERE id = p.id;
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
