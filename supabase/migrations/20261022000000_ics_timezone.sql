-- Company OS #5: calendar feeds + event timezones.
--
-- events.timezone records the venue's wall-clock zone (IANA) so exports,
-- feeds and reminders can speak in show-day terms; shifts keep absolute
-- timestamptz storage, ICS emits UTC instants with the zone named in the
-- description — correct for every subscriber regardless of their own zone.
--
-- calendar_feeds are capability URLs: the unguessable token IS the auth
-- (calendar clients can't hold JWTs), scoped to company / event / staff /
-- worker, revocable via is_active. The ics-feed edge function resolves the
-- token with the service role — feeds only ever read, never write.

ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Los_Angeles';

CREATE TABLE IF NOT EXISTS calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  scope text NOT NULL CHECK (scope IN ('company', 'event', 'staff', 'worker')),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_members(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  label text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_accessed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CHECK (
    (scope = 'company' AND event_id IS NULL AND staff_id IS NULL AND worker_id IS NULL)
    OR (scope = 'event' AND event_id IS NOT NULL)
    OR (scope = 'staff' AND staff_id IS NOT NULL)
    OR (scope = 'worker' AND worker_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS calendar_feeds_company_idx ON calendar_feeds (company_id, is_active);
CREATE INDEX IF NOT EXISTS calendar_feeds_token_idx ON calendar_feeds (token) WHERE is_active;

ALTER TABLE calendar_feeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar feeds owner all" ON calendar_feeds;
CREATE POLICY "calendar feeds owner all" ON calendar_feeds FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));
