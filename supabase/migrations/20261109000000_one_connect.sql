-- One Connect (WithOne) per-user OAuth grants.
--
-- one_connect_flows: short-lived PKCE/state rows created by the
-- one-connect edge function when a signed-in user starts the connect
-- flow. Service-role only — no client policies, flows are single-use.
--
-- one_connections: the durable per-user grant. connect_user_ref is the
-- opaque reference the Connect key mode uses to act on the user's
-- behalf ("cu_…" plus ";org=<id>" / ";project=<id>" when the user
-- granted into a tenant space). Workers read their own row to render
-- connection status; writes happen only inside the edge function.

create table if not exists public.one_connect_flows (
  state         text primary key,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  code_verifier text not null,
  return_to     text not null default '/integrations',
  expires_at    timestamptz not null default now() + interval '10 minutes',
  created_at    timestamptz not null default now()
);

create table if not exists public.one_connections (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  connect_user_ref  text not null,
  environment       text not null default 'live',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.one_connect_flows enable row level security;
alter table public.one_connections enable row level security;

-- Flows contain PKCE verifiers: nobody but the service role may touch them.
revoke all on public.one_connect_flows from anon, authenticated;

-- Users may read their own connection row (for "connected" UI state) and
-- delete it (disconnect). Inserts/updates stay service-role only.
create policy "one_connections_select_own"
  on public.one_connections for select
  using (profile_id = public.current_profile_id());

create policy "one_connections_delete_own"
  on public.one_connections for delete
  using (profile_id = public.current_profile_id());
