-- Demo-content flags: lets the marketplace ship with realistic seeded jobs
-- while keeping them identifiable and removable in one query.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE venues    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE events    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE shifts    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
