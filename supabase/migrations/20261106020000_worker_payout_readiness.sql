-- Company-side payout readiness: one batch RPC so the marketplace UI can badge
-- candidates, applicants and roster crew with "Ready to pay" / "W-9 needed"
-- without giving API roles a path into worker_sensitive (self-only RLS —
-- Stripe Connect fields are server-owned, guarded by worker_sensitive_guard_write).
--
-- Same posture as worker_travel_conflicts: SECURITY DEFINER, uuid[] input,
-- owns_company gate on p_company_id, and worker_related_to_company filters
-- unrelated workers OUT of the result entirely — no existence oracle. Workers
-- with no worker_sensitive row still report (connect_state 'none', W-9 missing)
-- because the LEFT JOIN is driven from the requested id list.
CREATE OR REPLACE FUNCTION worker_payout_readiness(p_company_id uuid, p_worker_ids uuid[])
RETURNS TABLE (worker_id uuid, connect_state text, payouts_enabled boolean,
               details_submitted boolean, w9_status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
  SELECT w.worker_id,
         CASE WHEN COALESCE(ws.payouts_enabled, false) THEN 'ready'
              WHEN COALESCE(ws.stripe_connect_details_submitted, false) THEN 'verifying'
              WHEN ws.stripe_connect_account_id IS NOT NULL THEN 'onboarding'
              ELSE 'none' END,
         COALESCE(ws.payouts_enabled, false),
         COALESCE(ws.stripe_connect_details_submitted, false),
         CASE
           WHEN EXISTS (SELECT 1 FROM compliance_docs d
                        WHERE d.worker_id = w.worker_id AND d.doc_type = 'w9'
                          AND d.status = 'approved') THEN 'approved'
           WHEN EXISTS (SELECT 1 FROM compliance_docs d
                        WHERE d.worker_id = w.worker_id AND d.doc_type = 'w9'
                          AND d.status = 'pending') THEN 'pending'
           WHEN EXISTS (SELECT 1 FROM compliance_docs d
                        WHERE d.worker_id = w.worker_id AND d.doc_type = 'w9'
                          AND d.status = 'rejected') THEN 'rejected'
           ELSE 'missing' END
  FROM (SELECT DISTINCT unnest(p_worker_ids) AS worker_id) w
  LEFT JOIN worker_sensitive ws ON ws.worker_id = w.worker_id
  WHERE owns_company(p_company_id)
    AND worker_related_to_company(w.worker_id, p_company_id);
$$;

REVOKE EXECUTE ON FUNCTION worker_payout_readiness(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION worker_payout_readiness(uuid, uuid[]) TO authenticated;
