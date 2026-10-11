-- Crew OS #3: BunkUp lodging pools + venue overnight-parking fields.
--
-- lodging_pools: a crew member hosts shared lodging for a shift (hotel suite,
-- Airbnb, house, camp/RV). pool_members join it; on join the trigger takes
-- spots and mints a crew_iou (kind='lodging', beneficiary=host, group=pool)
-- so the share settles out of the member's approved payout.
--
-- Pool lives on shift_id — same settlement path as rides: a worker's IOUs
-- deduct from the timesheet for that exact shift.
--
-- Venue side: overnight_parking / camping_allowed flags + parking_notes feed
-- the BunkUp board and the later SmartAlerts briefing (parking intel).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lodging_pool_kind') THEN
    CREATE TYPE lodging_pool_kind AS ENUM ('hotel', 'airbnb', 'house', 'camp', 'rv', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lodging_pool_status') THEN
    CREATE TYPE lodging_pool_status AS ENUM ('open', 'full', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pool_member_status') THEN
    CREATE TYPE pool_member_status AS ENUM ('joined', 'left', 'removed', 'cancelled');
  END IF;
END $$;

-- venue overnight-parking fields (BunkUp now, SmartAlerts parking intel later)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS overnight_parking boolean NOT NULL DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS camping_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS parking_notes text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS parking_json jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS lodging_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  host_worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind lodging_pool_kind NOT NULL,
  name text NOT NULL,                       -- "La Quinta suite", "Riverside campground"
  address_area text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  spots integer NOT NULL CHECK (spots > 0),
  spots_taken integer NOT NULL DEFAULT 0 CHECK (spots_taken >= 0 AND spots_taken <= spots),
  total_cost_cents integer CHECK (total_cost_cents IS NULL OR total_cost_cents >= 0),
  share_cents integer NOT NULL DEFAULT 0 CHECK (share_cents >= 0),  -- per spot, set by host
  notes text,
  status lodging_pool_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lodging_pools_shift_idx ON lodging_pools (shift_id, status);
CREATE INDEX IF NOT EXISTS lodging_pools_host_idx ON lodging_pools (host_worker_id);

CREATE TABLE IF NOT EXISTS pool_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES lodging_pools(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  spots_needed integer NOT NULL DEFAULT 1 CHECK (spots_needed > 0),
  status pool_member_status NOT NULL DEFAULT 'joined',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pool_members_pool_idx ON pool_members (pool_id, status);
CREATE INDEX IF NOT EXISTS pool_members_worker_idx ON pool_members (worker_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_lodging_pool_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.host_worker_id <> OLD.host_worker_id OR NEW.shift_id <> OLD.shift_id THEN
    RAISE EXCEPTION 'Pool host and shift are immutable';
  END IF;
  IF NEW.spots < OLD.spots_taken THEN
    RAISE EXCEPTION 'Cannot reduce spots below % already taken', OLD.spots_taken;
  END IF;
  IF OLD.host_worker_id <> current_profile_id()
     AND NOT owns_event((SELECT event_id FROM shifts WHERE id = OLD.shift_id)) THEN
    RAISE EXCEPTION 'Not a party to this lodging pool';
  END IF;
  IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled pools cannot be changed'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lodging_pools_guard ON lodging_pools;
CREATE TRIGGER lodging_pools_guard BEFORE UPDATE ON lodging_pools
  FOR EACH ROW EXECUTE FUNCTION guard_lodging_pool_update();

DROP TRIGGER IF EXISTS lodging_pools_touch ON lodging_pools;
CREATE TRIGGER lodging_pools_touch BEFORE UPDATE ON lodging_pools
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Members: the member joins/leaves their own row; the host or hiring company
-- may remove a member ('removed'). Status flips are validated here; seat/IOU
-- bookkeeping is the AFTER trigger's job.
CREATE OR REPLACE FUNCTION guard_pool_member_update() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.worker_id <> OLD.worker_id OR NEW.pool_id <> OLD.pool_id THEN
    RAISE EXCEPTION 'Member worker and pool are immutable';
  END IF;
  IF OLD.worker_id = current_profile_id() THEN
    IF OLD.status IN ('left', 'removed', 'cancelled') THEN
      RAISE EXCEPTION 'Closed memberships cannot be changed';
    END IF;
    IF NOT (NEW.status = OLD.status OR NEW.status = 'left') THEN
      RAISE EXCEPTION 'Members can only leave their own membership';
    END IF;
  ELSIF OLD.status = 'joined' AND NEW.status = 'removed'
     AND (owns_event((SELECT s.event_id FROM shifts s
                     JOIN lodging_pools p ON p.shift_id = s.id WHERE p.id = OLD.pool_id))
      OR current_profile_id() = (SELECT host_worker_id FROM lodging_pools WHERE id = OLD.pool_id)) THEN
    RETURN NEW;  -- host or company removing a member
  ELSE
    RAISE EXCEPTION 'Not a party to this membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pool_members_guard ON pool_members;
CREATE TRIGGER pool_members_guard BEFORE UPDATE ON pool_members
  FOR EACH ROW EXECUTE FUNCTION guard_pool_member_update();

DROP TRIGGER IF EXISTS pool_members_touch ON pool_members;
CREATE TRIGGER pool_members_touch BEFORE UPDATE ON pool_members
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Join validation: pool must be open, not the host's own pool, enough spots.
CREATE OR REPLACE FUNCTION check_pool_join() RETURNS trigger AS $$
DECLARE
  v_pool lodging_pools%ROWTYPE;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.status <> 'joined' THEN RETURN NEW; END IF;

  SELECT * INTO v_pool FROM lodging_pools WHERE id = NEW.pool_id;
  IF v_pool.id IS NULL THEN RAISE EXCEPTION 'Lodging pool not found'; END IF;
  IF v_pool.host_worker_id = NEW.worker_id THEN RAISE EXCEPTION 'Host cannot join their own pool'; END IF;
  IF v_pool.status = 'cancelled' THEN RAISE EXCEPTION 'Pool is cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM pool_members m WHERE m.pool_id = NEW.pool_id
             AND m.worker_id = NEW.worker_id AND m.status = 'joined' AND m.id <> NEW.id) THEN
    RAISE EXCEPTION 'Already a member of this pool';
  END IF;
  IF v_pool.spots - v_pool.spots_taken < NEW.spots_needed THEN
    RAISE EXCEPTION 'Not enough spots left in this pool';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pool_members_check_join ON pool_members;
CREATE TRIGGER pool_members_check_join BEFORE INSERT OR UPDATE ON pool_members
  FOR EACH ROW EXECUTE FUNCTION check_pool_join();

-- Spot + IOU bookkeeping (definer: members touch the host-owned pool row).
CREATE OR REPLACE FUNCTION sync_pool_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_pool lodging_pools%ROWTYPE;
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
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = OLD.pool_id AND worker_id = OLD.worker_id
       AND status = 'committed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pool_members_sync ON pool_members;
CREATE TRIGGER pool_members_sync AFTER INSERT OR UPDATE ON pool_members
  FOR EACH ROW EXECUTE FUNCTION sync_pool_member();

-- Pool cancelled: void group IOUs, close memberships, reset the spot ledger.
CREATE OR REPLACE FUNCTION cascade_lodging_pool_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE pool_members SET status = 'cancelled', updated_at = now()
     WHERE pool_id = NEW.id AND status = 'joined';
    UPDATE crew_iou SET status = 'void', updated_at = now()
     WHERE iou_group_id = NEW.id AND status = 'committed';
    NEW.spots_taken := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lodging_pools_cascade_cancel ON lodging_pools;
CREATE TRIGGER lodging_pools_cascade_cancel BEFORE UPDATE ON lodging_pools
  FOR EACH ROW EXECUTE FUNCTION cascade_lodging_pool_cancel();

-- Shift cancelled: pools die with it; crew_iou voids via the shift triggers.
CREATE OR REPLACE FUNCTION cascade_lodging_on_shift_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE pool_members SET status = 'cancelled', updated_at = now()
     WHERE status = 'joined' AND pool_id IN (SELECT id FROM lodging_pools WHERE shift_id = NEW.id);
    UPDATE lodging_pools SET status = 'cancelled', updated_at = now()
     WHERE shift_id = NEW.id AND status IN ('open', 'full');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_cancel_lodging ON shifts;
CREATE TRIGGER shifts_cancel_lodging AFTER UPDATE OF status ON shifts
  FOR EACH ROW EXECUTE FUNCTION cascade_lodging_on_shift_cancel();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE lodging_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lodging pools visible with shift" ON lodging_pools;
CREATE POLICY "lodging pools visible with shift" ON lodging_pools FOR SELECT TO authenticated
  USING (worker_can_see_shift(shift_id)
     OR host_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = lodging_pools.shift_id)));

DROP POLICY IF EXISTS "hosts post own pools" ON lodging_pools;
CREATE POLICY "hosts post own pools" ON lodging_pools FOR INSERT TO authenticated
  WITH CHECK (host_worker_id = current_profile_id() AND status = 'open' AND spots_taken = 0);

DROP POLICY IF EXISTS "parties update pools" ON lodging_pools;
CREATE POLICY "parties update pools" ON lodging_pools FOR UPDATE TO authenticated
  USING (host_worker_id = current_profile_id()
     OR owns_event((SELECT event_id FROM shifts WHERE id = lodging_pools.shift_id)));

-- members visible to the pool's audience: member self, host, company, and
-- anyone who can see the pool's shift (roommates need to see who's in)
DROP POLICY IF EXISTS "pool members visible with pool" ON pool_members;
CREATE POLICY "pool members visible with pool" ON pool_members FOR SELECT TO authenticated
  USING (worker_id = current_profile_id()
     OR EXISTS (
          SELECT 1 FROM lodging_pools p
          WHERE p.id = pool_members.pool_id
            AND (p.host_worker_id = current_profile_id()
                 OR worker_can_see_shift(p.shift_id)
                 OR owns_event((SELECT event_id FROM shifts WHERE id = p.shift_id)))));

DROP POLICY IF EXISTS "workers join pools" ON pool_members;
CREATE POLICY "workers join pools" ON pool_members FOR INSERT TO authenticated
  WITH CHECK (worker_id = current_profile_id() AND status = 'joined');

DROP POLICY IF EXISTS "parties update memberships" ON pool_members;
CREATE POLICY "parties update memberships" ON pool_members FOR UPDATE TO authenticated
  USING (worker_id = current_profile_id()
     OR current_profile_id() = (SELECT host_worker_id FROM lodging_pools WHERE id = pool_members.pool_id)
     OR owns_event((SELECT s.event_id FROM shifts s
                    JOIN lodging_pools p ON p.shift_id = s.id WHERE p.id = pool_members.pool_id)));
