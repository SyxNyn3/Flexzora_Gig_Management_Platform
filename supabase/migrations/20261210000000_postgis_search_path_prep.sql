-- Prep for moving PostGIS from public to the extensions schema.
-- Functions with a pinned search_path that call PostGIS objects
-- unqualified must include `extensions` or they fail after the move
-- (Supabase KB: security-advisor-flags-spatial_ref_sys...).
-- Appended at the end per the KB guidance; existing order preserved.
ALTER FUNCTION nearby_shifts(double precision, double precision, integer)
  SET search_path = public, pg_temp, extensions;
ALTER FUNCTION sync_profile_geo()
  SET search_path = public, pg_temp, extensions;
ALTER FUNCTION sync_venue_geo()
  SET search_path = public, pg_temp, extensions;
ALTER FUNCTION worker_distances(uuid[], double precision, double precision)
  SET search_path = public, pg_temp, extensions;
ALTER FUNCTION worker_sensitive_sync_geo()
  SET search_path = public, pg_temp, extensions;
