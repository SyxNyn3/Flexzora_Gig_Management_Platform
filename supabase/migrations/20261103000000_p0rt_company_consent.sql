-- P0-RT Lane A — company-side consent & mutability on money objects.
--
--   #19  board-resolve minted a payout-deduction IOU with no consent from the
--        person it was minted against. Minting now requires the DEBTOR's own
--        acceptance: the author when the post is a 'want' (author owes), the
--        fulfiller when it is an 'offer' (fulfiller owes). Resolving by the
--        debtor records consent immediately; otherwise the fulfiller accepts.
--   #20  crew_iou was company-writable on shift-anchored rows (beneficiary,
--        amount, status all rewritable). Companies are now read-only; every
--        legitimate write is a SECURITY DEFINER trigger/RPC, which the
--        current_user exemption already lets through.
--   #51  the debtor could void or settle their own IOU directly. The debtor
--        can no longer change an IOU at all; only the beneficiary may forgive
--        (void) it, and only before collection has started. Bails/cancels still
--        void through their definer cascades (explicit seat/booking release).
--   #23  offered_rate / match_score / match_breakdown could be rewritten by the
--        company after the worker had been offered or booked. They are frozen
--        from offered onward; re-offering a declined/withdrawn row may set a new
--        rate because the row is no longer in a frozen state.
--
-- Additive + idempotent. Grandfathering: resolved posts that already minted an
-- IOU before this migration are stamped as consented (see the backfill below) so
-- replaying the migration never double-mints. Those historic rows are NOT
-- unwound — flagged in AGENT_LOG for a human review of pre-fix offer-direction
-- resolutions.

-- ---------------------------------------------------------------------------
-- #19 consent column + grandfather backfill (must run BEFORE the mint trigger)
-- ---------------------------------------------------------------------------

ALTER TABLE crew_posts ADD COLUMN IF NOT EXISTS debtor_confirmed_at timestamptz;

UPDATE crew_posts p
   SET debtor_confirmed_at = coalesce(p.resolved_at, p.updated_at, now())
 WHERE p.status = 'resolved'
   AND p.debtor_confirmed_at IS NULL
   AND EXISTS (SELECT 1 FROM crew_iou i WHERE i.iou_group_id = p.id);

-- ---------------------------------------------------------------------------
-- #19 guard: consent + frozen terms on resolution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_crew_post_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
  v_debtor uuid := CASE WHEN OLD.direction = 'want' THEN OLD.author_worker_id ELSE OLD.fulfilled_by_worker_id END;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.author_worker_id <> OLD.author_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Post author and shift are immutable';
  END IF;

  -- Once resolved, the fulfiller and amount are exactly what the debtor is agreeing to.
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
  -- resolving, that action is their consent.
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
    IF NOT (NEW.status IN ('open', 'resolved', 'closed')) THEN
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

-- Fulfillers need to reach the row to accept a debt against them.
DROP POLICY IF EXISTS "parties update posts" ON crew_posts;
CREATE POLICY "parties update posts" ON crew_posts FOR UPDATE TO authenticated
  USING (author_worker_id = current_profile_id()
     OR fulfilled_by_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = crew_posts.shift_id)))
  WITH CHECK (author_worker_id = current_profile_id()
     OR fulfilled_by_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = crew_posts.shift_id)));

-- Resolution no longer mints; it only stamps the time (minting moved to the
-- consent-gated trigger below).
CREATE OR REPLACE FUNCTION settle_crew_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'resolved' AND NEW.status = 'resolved' THEN
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Mint exactly once, when the debtor's consent first lands on a paid,
-- fulfilled post.
CREATE OR REPLACE FUNCTION mint_crew_post_iou() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_debtor uuid;
  v_creditor uuid;
  v_kind crew_iou_kind;
BEGIN
  IF NEW.debtor_confirmed_at IS NULL OR OLD.debtor_confirmed_at IS NOT NULL THEN RETURN NULL; END IF;
  IF coalesce(NEW.amount_cents, 0) <= 0 OR NEW.fulfilled_by_worker_id IS NULL THEN RETURN NULL; END IF;

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

DROP TRIGGER IF EXISTS crew_posts_mint ON crew_posts;
CREATE TRIGGER crew_posts_mint AFTER UPDATE ON crew_posts
  FOR EACH ROW EXECUTE FUNCTION mint_crew_post_iou();

-- ---------------------------------------------------------------------------
-- #20 + #51 guard for crew_iou
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_crew_iou_update() RETURNS trigger AS $$
DECLARE
  v_me uuid := current_profile_id();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  -- #20 Companies are read-only on crew IOUs. Shift-cancel voids and every
  -- settlement path run as SECURITY DEFINER and are exempt above.
  IF OLD.shift_id IS NOT NULL AND owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id))
     AND v_me IS DISTINCT FROM OLD.worker_id AND v_me IS DISTINCT FROM OLD.beneficiary_worker_id THEN
    RAISE EXCEPTION 'Companies cannot modify crew IOUs';
  END IF;

  -- #51 The debtor cannot void or settle their own IOU. Forgiveness belongs to
  -- the beneficiary; bails/cancels release their booking via definer cascades.
  IF OLD.worker_id = v_me THEN
    RAISE EXCEPTION 'Debtors cannot change a crew IOU — ask the beneficiary to forgive it';
  END IF;

  IF OLD.beneficiary_worker_id = v_me AND NEW.beneficiary_worker_id = v_me THEN
    IF OLD.status <> 'committed' THEN RAISE EXCEPTION 'Only committed IOUs can be changed'; END IF;
    IF NEW.worker_id <> OLD.worker_id OR NEW.amount_cents <> OLD.amount_cents OR NEW.kind <> OLD.kind
       OR NEW.iou_group_id IS DISTINCT FROM OLD.iou_group_id
       OR NEW.settled_cents IS DISTINCT FROM OLD.settled_cents THEN
      RAISE EXCEPTION 'Only status can change on a crew IOU';
    END IF;
    IF NEW.status = 'void' THEN
      IF coalesce(OLD.settled_cents, 0) > 0 THEN
        RAISE EXCEPTION 'An IOU that has started settling cannot be voided';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.status = 'settled' AND OLD.settle_via = 'manual' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Beneficiary can only forgive (void) or mark manual IOUs settled';
  END IF;

  RAISE EXCEPTION 'Not a party to this IOU';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- #23 offer terms freeze
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_assignment_update() RETURNS trigger AS $$
DECLARE
  v_company boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.shift_id <> OLD.shift_id OR NEW.worker_id <> OLD.worker_id OR NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'Assignment shift, worker and source are immutable';
  END IF;

  -- #23 price and match terms are fixed once the worker has been offered or booked.
  IF OLD.status IN ('offered', 'confirmed', 'completed', 'no_show') AND (
       NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
    OR NEW.match_score IS DISTINCT FROM OLD.match_score
    OR NEW.match_breakdown IS DISTINCT FROM OLD.match_breakdown) THEN
    RAISE EXCEPTION 'Offer terms are frozen once offered or booked';
  END IF;

  v_company := owns_shift(OLD.shift_id);

  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' AND NOT shift_has_room(OLD.shift_id, OLD.id) THEN
    RAISE EXCEPTION 'This call is already fully staffed';
  END IF;

  IF v_company THEN
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'applied'   AND NEW.status IN ('confirmed', 'rejected'))
         OR (OLD.status = 'offered'   AND NEW.status = 'rejected')
         OR (OLD.status = 'confirmed' AND NEW.status IN ('no_show', 'rejected'))
         OR (OLD.status IN ('declined', 'withdrawn', 'rejected') AND NEW.status = 'offered')) THEN
      RAISE EXCEPTION 'Company cannot move assignment from % to %', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.worker_id = current_profile_id() THEN
    IF NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
       OR NEW.match_score IS DISTINCT FROM OLD.match_score
       OR NEW.match_breakdown IS DISTINCT FROM OLD.match_breakdown THEN
      RAISE EXCEPTION 'Workers cannot change offer terms';
    END IF;
    IF NOT (NEW.status = OLD.status
         OR (OLD.status = 'offered' AND NEW.status IN ('confirmed', 'declined'))
         OR (OLD.status IN ('applied', 'confirmed') AND NEW.status = 'withdrawn')) THEN
      RAISE EXCEPTION 'Worker cannot move assignment from % to %', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this assignment';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
