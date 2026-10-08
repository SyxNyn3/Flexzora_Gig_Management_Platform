-- Demo-request intake table.
--
-- The schedule-demo edge function previously validated the form and returned
-- fake success without persisting anything — every demo request was lost.
-- Columns mirror the fields ScheduleDemoForm actually posts. Rows are written
-- by the edge function with the service role; there is no client-facing read
-- path, so RLS grants nothing to anon/authenticated.

CREATE TABLE IF NOT EXISTS demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  company_website text,
  company_size text,
  industry_focus text,
  num_workers_managed text,
  annual_gigs text,
  current_software text,
  communication_methods text,
  payroll_process text,
  pain_points text,
  preferred_date date,
  preferred_time text,
  additional_notes text,
  has_roster boolean DEFAULT false,
  has_scheduling_docs boolean DEFAULT false,
  has_payment_docs boolean DEFAULT false,
  marketing_consent boolean DEFAULT false,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_requests_status_idx ON demo_requests (status);
CREATE INDEX IF NOT EXISTS demo_requests_created_idx ON demo_requests (created_at DESC);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated can neither read nor write. All access goes
-- through the service role (edge function) or the dashboard.
