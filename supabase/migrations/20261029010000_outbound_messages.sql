-- Outbound message log — every SMS/email/push the system sends gets a
-- row so the unified feed can show "we texted you at 4:12pm" proof.
-- Writes happen inside edge functions with the service role; users only
-- read their own rows.
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_contact text,          -- the address/number it went to
  channel text not null check (channel in ('sms','email','push')),
  template text,                   -- which message kind it was
  subject text,
  body_preview text,
  status text not null default 'sent' check (status in ('sent','failed')),
  error text,
  ref_type text,                   -- optional entity the message is about
  ref_id uuid,
  created_at timestamptz not null default now()
);
alter table public.outbound_messages enable row level security;
create index outbound_messages_recipient_idx
  on public.outbound_messages (recipient_profile_id, created_at desc);
create policy "users read own outbound messages" on public.outbound_messages
  for select using (recipient_profile_id = public.current_profile_id());
-- No insert/update/delete policies — only the service role writes.
