-- ============================================================================
-- Worker availability: day-level status for the whole year
-- ============================================================================
-- The existing `availability` table stores time windows (start_time/end_time)
-- — good for "available Tue 8a–6p" but wrong granularity for the thing crew
-- actually think in: whole days. "I'm out Dec 24–Jan 2", "tentative for the
-- Austin festival weekend", "Mom's birthday — don't book me". Companies book
-- against days, not windows.
--
-- `worker_availability_days` is one row per worker per day:
--   available   — explicitly open (default assumption is "not marked" anyway)
--   unavailable — hard block, never book
--   tentative   — maybe; companies should treat as soft-blocked
-- `note` is worker-private ("sister's wedding") — it is never exposed to
-- companies in v1; the company-facing read is a separate scoped surface.
--
-- RLS: workers own their rows fully. No company SELECT policy yet — matching
-- should consume a definer RPC that returns only {day, status} (no notes) so
-- personal reasons stay private. That RPC lands with the matching work.
-- ============================================================================

CREATE TYPE availability_day_status AS ENUM ('available', 'unavailable', 'tentative');

CREATE TABLE worker_availability_days (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  status     availability_day_status NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, day)
);

CREATE INDEX worker_availability_days_worker_day_idx
  ON worker_availability_days (worker_id, day);

ALTER TABLE worker_availability_days ENABLE ROW LEVEL SECURITY;

-- Workers manage their own rows; nothing else reads them yet.
CREATE POLICY "workers manage own availability days"
  ON worker_availability_days FOR ALL TO authenticated
  USING (worker_id = auth.uid())
  WITH CHECK (worker_id = auth.uid());

-- Server-owned fields: worker_id must equal the caller, and status/note are
-- free text the worker owns — nothing server-owned to guard beyond auth.uid().
-- updated_at maintained by trigger for cheap "last touched" debugging.
CREATE OR REPLACE FUNCTION touch_availability_day() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION touch_availability_day() FROM PUBLIC;

CREATE TRIGGER worker_availability_days_touch
  BEFORE UPDATE ON worker_availability_days
  FOR EACH ROW EXECUTE FUNCTION touch_availability_day();

-- Grants: authenticated gets full DML through RLS; anon gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_availability_days TO authenticated;
REVOKE ALL ON worker_availability_days FROM anon;
