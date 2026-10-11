-- Scheduled sweeps: roster→public auto-release + ops/no-show/alert generators.
-- Today all of these fire only when someone loads a page — an overnight call or a
-- weekend gap means no-shows go undetected and roster holds never release. pg_cron
-- runs them every 15 minutes; the client calls stay as the prompt path.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Global roster-window release (client version is event-scoped + RLS-bound).
CREATE OR REPLACE FUNCTION release_stale_roster_broadcasts(p_roster_first_hours int DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE shifts
     SET broadcast_stage    = 'public',
         public_broadcast_at = now()
   WHERE status           = 'open'
     AND broadcast_stage  = 'roster'
     AND roster_broadcast_at < now() - make_interval(hours => p_roster_first_hours);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- One entry point for cron: release stale broadcasts, then run every
-- company-scoped generator for every company.
CREATE OR REPLACE FUNCTION run_company_sweeps()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company record;
BEGIN
  PERFORM release_stale_roster_broadcasts();
  FOR v_company IN SELECT id FROM companies LOOP
    PERFORM generate_unfilled_tasks(v_company.id);
    PERFORM detect_no_shows(v_company.id);
    PERFORM generate_company_alerts(v_company.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION release_stale_roster_broadcasts(int) FROM public;
REVOKE ALL ON FUNCTION run_company_sweeps() FROM public;

-- Named job (pg_cron >= 1.4): replace-on-rerun keeps migrations idempotent
-- when replayed against a branch that already scheduled it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'company-sweeps') THEN
    PERFORM cron.unschedule('company-sweeps');
  END IF;
  PERFORM cron.schedule('company-sweeps', '*/15 * * * *', 'SELECT run_company_sweeps()');
END;
$$;
