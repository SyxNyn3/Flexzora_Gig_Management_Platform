-- Mirrors the one-time remote extension moves (public -> extensions
-- schema) performed 2026-12-10 to clear the Security Advisor
-- extension_in_public findings:
--   postgis -> extensions (drop/recreate; geo columns restored)
--   vector   -> extensions (drop/recreate; embedding column restored)
--   pg_trgm  -> extensions (drop/recreate; no dependent columns)
--
-- On fresh replays the CREATE EXTENSION statements in
-- 20251007000001_ai_infrastructure.sql and
-- 20260928220000_marketplace_core.sql now specify WITH SCHEMA
-- extensions, so these columns/index already exist in the right
-- schema and every statement below is a no-op (IF NOT EXISTS).
-- Unqualified type names resolve through search_path in both layouts.

-- PostGIS geo columns (trigger-derived from latitude/longitude; both
-- tables were empty at move time, so no data was lost).
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);
ALTER TABLE public.worker_sensitive ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);
CREATE INDEX IF NOT EXISTS venues_geo_idx ON public.venues USING gist (geo);

-- pgvector embedding column + ivfflat index (embedding_cache was empty
-- at move time; it is a regenerable cache).
ALTER TABLE public.embedding_cache ADD COLUMN IF NOT EXISTS embedding vector(384);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_vector
  ON public.embedding_cache USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
