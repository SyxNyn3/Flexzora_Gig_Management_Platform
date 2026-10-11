-- Crew OS #4: CrewBoard — the shift's structured bulletin board.
--
-- gig_messages is creator-broadcast on the legacy gigs table, so crew posts
-- get their own table on shift_id. Posts are structured: a category
-- (ride/lodging/food/borrow/announce), a direction ('want' — I need this,
-- 'offer' — I have this), an optional amount, and a resolution path.
--
-- The IOU link: when the author marks a post resolved and names the worker
-- who fulfilled it, the trigger mints a crew_iou so the deal lands on the
-- ledger — debt direction follows the post's direction:
--   'want'  (I need X, someone provided it) -> author owes the fulfiller
--   'offer' (I have X, someone took it)     -> fulfiller owes the author
-- amount_cents NULL/0 resolves as a favor — no IOU.
--
-- Dedicated boards (ride_offers, lodging_pools, food_runs) remain the source
-- of truth for their flows; CrewBoard covers borrow/general asks and gives
-- the app one feed to render per shift.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_post_category') THEN
    CREATE TYPE crew_post_category AS ENUM ('ride', 'lodging', 'food', 'borrow', 'announce', 'general');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_post_direction') THEN
    CREATE TYPE crew_post_direction AS ENUM ('want', 'offer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_post_status') THEN
    CREATE TYPE crew_post_status AS ENUM ('open', 'resolved', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crew_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  author_worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category crew_post_category NOT NULL DEFAULT 'general',
  direction crew_post_direction NOT NULL DEFAULT 'want',
  title text NOT NULL,
  body text,
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  ref_id uuid,                            -- app-level link to offer/pool/run row
  status crew_post_status NOT NULL DEFAULT 'open',
  fulfilled_by_worker_id uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'resolved' OR fulfilled_by_worker_id IS NOT NULL),
  CHECK (fulfilled_by_worker_id IS NULL OR fulfilled_by_worker_id <> author_worker_id)
);

CREATE INDEX IF NOT EXISTS crew_posts_shift_idx ON crew_posts (shift_id, category, status);
CREATE INDEX IF NOT EXISTS crew_posts_author_idx ON crew_posts (author_worker_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_crew_post_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.author_worker_id <> OLD.author_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Post author and shift are immutable';
  END IF;
  IF OLD.author_worker_id = current_profile_id() THEN
    IF OLD.status = 'closed' THEN RAISE EXCEPTION 'Closed posts cannot be changed'; END IF;
    IF NOT (NEW.status IN ('open', 'resolved', 'closed')) THEN
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
$$;

DROP TRIGGER IF EXISTS crew_posts_guard ON crew_posts;
CREATE TRIGGER crew_posts_guard BEFORE UPDATE ON crew_posts
  FOR EACH ROW EXECUTE FUNCTION guard_crew_post_update();

DROP TRIGGER IF EXISTS crew_posts_touch ON crew_posts;
CREATE TRIGGER crew_posts_touch BEFORE UPDATE ON crew_posts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Resolving a post with an amount mints the IOU between author and fulfiller.
CREATE OR REPLACE FUNCTION settle_crew_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_debtor uuid;
  v_creditor uuid;
  v_kind crew_iou_kind;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'resolved' AND NEW.status = 'resolved' THEN
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

DROP TRIGGER IF EXISTS crew_posts_settle ON crew_posts;
CREATE TRIGGER crew_posts_settle BEFORE UPDATE OF status ON crew_posts
  FOR EACH ROW EXECUTE FUNCTION settle_crew_post();

-- Shift cancelled: open posts close; IOUs already void via shift triggers.
CREATE OR REPLACE FUNCTION cascade_posts_on_shift_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE crew_posts SET status = 'closed', updated_at = now()
     WHERE shift_id = NEW.id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_close_crew_posts ON shifts;
CREATE TRIGGER shifts_close_crew_posts AFTER UPDATE OF status ON shifts
  FOR EACH ROW EXECUTE FUNCTION cascade_posts_on_shift_cancel();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE crew_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew posts visible with shift" ON crew_posts;
CREATE POLICY "crew posts visible with shift" ON crew_posts FOR SELECT TO authenticated
  USING (worker_can_see_shift(shift_id)
     OR author_worker_id = current_profile_id()
     OR fulfilled_by_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = crew_posts.shift_id)));

DROP POLICY IF EXISTS "workers post own" ON crew_posts;
CREATE POLICY "workers post own" ON crew_posts FOR INSERT TO authenticated
  WITH CHECK (author_worker_id = current_profile_id() AND status = 'open');

DROP POLICY IF EXISTS "parties update posts" ON crew_posts;
CREATE POLICY "parties update posts" ON crew_posts FOR UPDATE TO authenticated
  USING (author_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = crew_posts.shift_id)));
