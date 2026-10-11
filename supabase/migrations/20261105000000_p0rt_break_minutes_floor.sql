-- P0-RT #21 — negative break_minutes inflated payable hours. The value is
-- worker-visible and approve_timesheet also accepts a company override, and
-- neither was floored: a negative break adds paid time to the gross.
--
-- The floor is a row CHECK, so it covers every writer. It is added NOT VALID:
-- enforced on every new or updated row, but existing rows are not scanned.
-- That keeps `supabase db push` from being blocked by pre-existing bad data. A
-- legacy negative row fails its next approval with a check_violation, which is
-- the intended loud failure.
--
-- Additive + idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheets_break_minutes_floor') THEN
    ALTER TABLE timesheets
      ADD CONSTRAINT timesheets_break_minutes_floor CHECK (break_minutes >= 0) NOT VALID;
  END IF;
END $$;
