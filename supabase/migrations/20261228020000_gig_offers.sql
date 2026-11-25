-- Gig-offer inbox: external offers (Gmail today, SMS later) land here for
-- the worker to accept / decline / counter. Auto-rules let a worker
-- pre-approve patterns ("always take rigging calls from Rhino Staging")
-- evaluated at ingestion time by the google-connect edge function.

create table if not exists public.gig_offers (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('gmail', 'sms', 'manual')),
  -- Provider message id — dedup key so re-syncs don't duplicate offers.
  external_id text,
  sender text,
  subject text,
  body_excerpt text,
  -- LLM-extracted fields: role, company, call_date, location, rate, notes.
  parsed jsonb not null default '{}',
  status text not null default 'new'
    check (status in ('new', 'accepted', 'declined', 'countered', 'conflict', 'expired', 'converted')),
  -- Set when the offer maps to a real platform gig/application.
  gig_id uuid references public.gigs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, source, external_id)
);

create index if not exists gig_offers_worker_idx on public.gig_offers (worker_id, status, created_at desc);

alter table public.gig_offers enable row level security;

-- Workers see and manage only their own offers. Status transitions are
-- client-writable (accept/decline/counter are the worker's choice); the
-- edge function writes with service role for ingestion and auto-rules.
create policy "gig_offers owner all" on public.gig_offers
  for all to authenticated
  using (worker_id = current_profile_id())
  with check (worker_id = current_profile_id());

create table if not exists public.offer_rules (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  -- Sender match: substring of the from-address or display name
  -- (e.g. 'rhino staging' or 'bookings@rhino.com'). Null = any sender.
  match_sender text,
  -- Any-of keyword match against subject + body excerpt.
  match_keywords text[] not null default '{}',
  action text not null check (action in ('accept', 'decline', 'counter')),
  counter_rate numeric(10,2),
  -- When true, auto-actions are skipped if the parsed call window overlaps
  -- an existing calendar_event — the offer is flagged 'conflict' instead.
  require_no_conflict boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists offer_rules_worker_idx on public.offer_rules (worker_id) where enabled;

alter table public.offer_rules enable row level security;

create policy "offer_rules owner all" on public.offer_rules
  for all to authenticated
  using (worker_id = current_profile_id())
  with check (worker_id = current_profile_id());
