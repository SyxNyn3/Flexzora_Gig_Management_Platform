-- Closed-beta gate: signups create accounts + profiles but can't reach
-- app routes until approved. Approve via:
--   update profiles set beta_approved = true where email = '...';
alter table public.profiles
  add column if not exists beta_approved boolean not null default false;
