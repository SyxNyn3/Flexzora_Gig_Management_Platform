-- Native Google integration: OAuth connections, event links, and the
-- calendar_events → Google Calendar push trigger.
--
-- google_connections holds live Google OAuth tokens. RLS is enabled with
-- NO policies on purpose: tokens are server-side secrets, readable only by
-- the service role inside edge functions. Same for google_event_links and
-- google_connect_flows.

create table if not exists public.google_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text,
  token_expiry timestamptz,
  scopes text,
  calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;

-- Maps a Flexzora calendar_events row to the Google Calendar event we
-- pushed for it, so updates patch instead of duplicating and deletes
-- remove the remote copy.
create table if not exists public.google_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  flexzora_event_id uuid not null references public.calendar_events(id) on delete cascade,
  google_event_id text not null,
  google_calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, flexzora_event_id)
);

alter table public.google_event_links enable row level security;
revoke all on public.google_event_links from anon, authenticated;

-- Single-use OAuth state rows for the google-connect callback. The state
-- value is the credential — same pattern as one_connect_flows.
create table if not exists public.google_connect_flows (
  state text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  return_to text not null default '/integrations',
  created_at timestamptz not null default now()
);

alter table public.google_connect_flows enable row level security;
revoke all on public.google_connect_flows from anon, authenticated;

-- ── Auto-push: calendar_events changes notify the google-connect edge ────
-- The function re-reads the row with the service role, so the trigger only
-- ships identifiers — never trusting client payloads. Skips silently when
-- internal_config.google_fn_url / the vault push_internal_secret aren't
-- configured, matching the push-dispatch convention.
create or replace function public.notify_google_event_sync()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text := internal_config_get('google_fn_url');
  secret text := internal_secret_get('push_internal_secret');
  uid uuid;
  eid uuid;
  op text;
begin
  if fn_url is null or fn_url = '' or secret is null or secret = '' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    uid := old.user_id; eid := old.id; op := 'delete';
  else
    uid := new.user_id; eid := new.id; op := 'upsert';
  end if;

  -- Only users with a Google connection have anything to push to; the
  -- function re-checks anyway, this just avoids noise.
  if not exists (select 1 from public.google_connections gc where gc.user_id = uid) then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('user_id', uid, 'event_id', eid, 'op', op),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Secret', secret
    )
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.notify_google_event_sync() from public, anon, authenticated;

drop trigger if exists calendar_events_google_sync on public.calendar_events;
create trigger calendar_events_google_sync
  after insert or update or delete on public.calendar_events
  for each row execute function public.notify_google_event_sync();
