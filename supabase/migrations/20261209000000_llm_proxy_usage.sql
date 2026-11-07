-- Per-user call log for the llm-proxy edge function. Every authenticated
-- call inserts one row; the function counts rows for the user over the last
-- 24h and caps at DAILY_LIMIT (60). Copilot queries and import-mapping
-- suggestions are small, so 60/day is generous for a human and bounds what
-- a stolen session can spend on upstream LLM tokens.
--
-- Access is service-role only: RLS is enabled with no policies, so the
-- anon/authenticated roles get nothing even if they learn the table name.
-- The function prunes rows older than 7 days opportunistically.

CREATE TABLE IF NOT EXISTS public.llm_proxy_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_proxy_hits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_llm_proxy_hits_user_ts
  ON public.llm_proxy_hits (user_id, ts);
