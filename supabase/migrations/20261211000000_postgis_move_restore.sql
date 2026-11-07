-- Mirrors the one-time remote PostGIS move (public -> extensions schema)
-- performed 2026-12-10 to clear the Security Advisor findings on
-- public.spatial_ref_sys / geometry_columns / geography_columns /
-- st_estimatedextent. On the production project the geo columns were
-- dropped by `DROP EXTENSION postgis CASCADE` and recreated here;
-- venues had no rows and worker_sensitive was empty, so no data was
-- lost (geo is trigger-derived from latitude/longitude regardless).
--
-- On fresh replays (CI, new environments) postgis is still created in
-- public by 20260928220000_marketplace_core.sql, so these statements
-- are no-ops: the columns and index already exist and the type name
-- resolves through search_path in both layouts.
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);
ALTER TABLE public.worker_sensitive ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);
CREATE INDEX IF NOT EXISTS venues_geo_idx ON public.venues USING gist (geo);
