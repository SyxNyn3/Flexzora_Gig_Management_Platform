-- Venue coordinates for gigs: geocoded from the location string at
-- creation time via the Google Maps Geocoding API (browser-side, public
-- key). Nullable — gigs without coordinates simply don't render a map.
alter table public.gigs
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
