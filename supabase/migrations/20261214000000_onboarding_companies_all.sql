-- onboarding_companies must list EVERY company the worker has a
-- relationship with — including ones whose checklist already exists.
-- The 20261213 version excluded companies with a gig_onboarding row, so a
-- company vanished from the start-pack UI the moment its checklist was
-- created. Return checklist status alongside so the UI can badge progress.
--
-- Also include expense-only relationships (expenses -> gigs.company_id),
-- matching the relationship test inside onboarding_get().

DROP FUNCTION IF EXISTS onboarding_companies();

CREATE FUNCTION onboarding_companies()
RETURNS TABLE(
  company_id uuid,
  company_name text,
  first_seen timestamptz,
  checklist_status text,
  checklist_done integer,
  checklist_total integer
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
  WITH rel AS (
    SELECT ev.company_id, MIN(sa.confirmed_at) AS first_seen
    FROM shift_assignments sa
    JOIN shifts s ON s.id = sa.shift_id
    JOIN events ev ON ev.id = s.event_id
    WHERE sa.worker_id = current_profile_id()
    GROUP BY ev.company_id
    UNION ALL
    SELECT i.company_id, MIN(i.issued_at)
    FROM invoices i WHERE i.worker_id = current_profile_id()
    GROUP BY i.company_id
    UNION ALL
    SELECT g.company_id, MIN(e.created_at)
    FROM expenses e
    JOIN gigs g ON g.id = e.gig_id
    WHERE e.worker_id = current_profile_id()
    GROUP BY g.company_id
  )
  SELECT
    r.company_id,
    c.name,
    MIN(r.first_seen) AS first_seen,
    o.status AS checklist_status,
    COALESCE((
      SELECT count(*)::integer
      FROM jsonb_each_text(o.items) it
      WHERE it.value IN ('confirmed', 'waived')
    ), 0) AS checklist_done,
    COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(o.items)), 0) AS checklist_total
  FROM rel r
  JOIN companies c ON c.id = r.company_id
  LEFT JOIN gig_onboarding o
    ON o.worker_id = current_profile_id() AND o.company_id = r.company_id
  GROUP BY r.company_id, c.name, o.status, o.items
  ORDER BY first_seen;
$$;

REVOKE EXECUTE ON FUNCTION onboarding_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding_companies() TO authenticated;
